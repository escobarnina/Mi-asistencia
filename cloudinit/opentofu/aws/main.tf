#
#  Sistema de Asistencia — 2 servidores en AWS usando Cloud-Init
#    VM 1: Backend  (Node 20 Express :8000 + MariaDB local)
#    VM 2: Frontend (Nginx :80 sirviendo React/Vite compilado y proxy /api/ al backend)
#

# ---------- Red: usamos la VPC por defecto que trae toda cuenta AWS ----------
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# ---------- Imagen: Ubuntu Server 24.04 LTS oficial de Canonical ----------
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ---------- Llave SSH (se genera y se guarda como archivo .pem local) ----------
resource "tls_private_key" "ssh" {
  algorithm = "ED25519"
}

resource "aws_key_pair" "ssh" {
  key_name   = "${var.proyecto}-llave"
  public_key = tls_private_key.ssh.public_key_openssh
}

resource "local_sensitive_file" "llave_pem" {
  content         = tls_private_key.ssh.private_key_openssh
  filename        = "${path.module}/${var.proyecto}-llave.pem"
  file_permission = "0600"
}

# ---------- Secretos generados ----------
resource "random_password" "db" {
  length  = 20
  special = false
}

resource "random_password" "jwt" {
  length  = 48
  special = false
}

# ---------- Security Group: Frontend ----------
resource "aws_security_group" "frontend" {
  count       = var.crear_frontend ? 1 : 0
  name        = "${var.proyecto}-sg-frontend"
  description = "Frontend: HTTP publico (80) y SSH (22)"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP publico"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.mi_ip]
  }

  egress {
    description = "Salida a internet para descargar paquetes"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name     = "${var.proyecto}-sg-frontend"
    proyecto = var.proyecto
  }
}

# ---------- Security Group: Backend ----------
resource "aws_security_group" "backend" {
  name        = "${var.proyecto}-sg-backend"
  description = "Backend: API 8000 y SSH. MySQL NO se expone a internet."
  vpc_id      = data.aws_vpc.default.id

  egress {
    description = "Salida a internet para dependencias"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name     = "${var.proyecto}-sg-backend"
    proyecto = var.proyecto
  }
}

# Reglas de entrada para el Backend
resource "aws_vpc_security_group_ingress_rule" "ssh_backend" {
  security_group_id = aws_security_group.backend.id
  description       = "SSH al backend"
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
  cidr_ipv4         = var.mi_ip
}

resource "aws_vpc_security_group_ingress_rule" "api_publica" {
  count             = var.backend_publico ? 1 : 0
  security_group_id = aws_security_group.backend.id
  description       = "API publica en puerto 8000"
  ip_protocol       = "tcp"
  from_port         = 8000
  to_port           = 8000
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "api_desde_frontend" {
  count                        = var.crear_frontend ? 1 : 0
  security_group_id            = aws_security_group.backend.id
  description                  = "API accesible desde la VM Frontend (AWS)"
  ip_protocol                  = "tcp"
  from_port                    = 8000
  to_port                      = 8000
  referenced_security_group_id = aws_security_group.frontend[0].id
}

resource "aws_vpc_security_group_ingress_rule" "api_desde_externo" {
  count             = var.frontend_ip_externa != "" ? 1 : 0
  security_group_id = aws_security_group.backend.id
  description       = "API desde frontend externo"
  ip_protocol       = "tcp"
  from_port         = 8000
  to_port           = 8000
  cidr_ipv4         = var.frontend_ip_externa
}

# ---------- VM 1: BACKEND (Node.js + MariaDB) con Cloud-Init ----------
resource "aws_instance" "backend" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.tipo_instancia
  subnet_id                   = data.aws_subnets.default.ids[0]
  vpc_security_group_ids      = [aws_security_group.backend.id]
  key_name                    = aws_key_pair.ssh.key_name
  associate_public_ip_address = true
  ebs_optimized               = true
  monitoring                  = true

  metadata_options {
    http_tokens                 = "required"
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_size = 20 # GB
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/cloud-init.yaml", {
    rol            = "backend"
    backend_ip     = ""
    repo_url       = var.repo_url
    repo_rama      = var.repo_rama
    db_password    = random_password.db.result
    jwt_secret     = random_password.jwt.result
    admin_email    = var.admin_email
    admin_password = var.admin_password
  })
  user_data_replace_on_change = true

  tags = {
    Name      = "${var.proyecto}-tofu-backend"
    proyecto  = var.proyecto
    rol       = "backend"
    herramienta = "opentofu"
  }

  lifecycle {
    ignore_changes = [
      associate_public_ip_address,
    ]
  }
}

# ---------- VM 2: FRONTEND (Nginx sirviendo React) con Cloud-Init ----------
resource "aws_instance" "frontend" {
  count                       = var.crear_frontend ? 1 : 0
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.tipo_instancia
  subnet_id                   = data.aws_subnets.default.ids[0]
  vpc_security_group_ids      = [aws_security_group.frontend[0].id]
  key_name                    = aws_key_pair.ssh.key_name
  associate_public_ip_address = true
  ebs_optimized               = true
  monitoring                  = true

  metadata_options {
    http_tokens                 = "required"
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_size = 10 # GB
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/cloud-init.yaml", {
    rol            = "frontend"
    backend_ip     = aws_instance.backend.private_ip
    repo_url       = var.repo_url
    repo_rama      = var.repo_rama
    db_password    = ""
    jwt_secret     = ""
    admin_email    = ""
    admin_password = ""
  })
  user_data_replace_on_change = true

  tags = {
    Name        = "${var.proyecto}-tofu-frontend"
    proyecto    = var.proyecto
    rol         = "frontend"
    herramienta = "opentofu"
  }

  lifecycle {
    ignore_changes = [
      associate_public_ip_address,
    ]
  }
}

# ---------- Forzar estado RUNNING ----------
resource "aws_ec2_instance_state" "backend" {
  instance_id = aws_instance.backend.id
  state       = "running"
}

resource "aws_ec2_instance_state" "frontend" {
  count       = var.crear_frontend ? 1 : 0
  instance_id = aws_instance.frontend[0].id
  state       = "running"
}
