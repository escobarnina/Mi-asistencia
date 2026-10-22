#
#  Sistema de Asistencia — 2 servidores en AWS sin Docker
#    VM 1: backend  (Node 20 + Express + MySQL 8 local)   puerto 8000
#    VM 2: frontend (nginx sirve el build de Vite y reenvía /api)  puerto 80


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
  file_permission = "0600" # 0400 en Windows deja el .pem de solo lectura y el siguiente apply falla
}

# ---------- Secretos generados (no hace falta inventarlos) ----------
resource "random_password" "db" {
  length  = 20
  special = false
}

resource "random_password" "jwt" {
  length  = 48
  special = false
}

# ---------- Firewalls (Security Groups) ----------
resource "aws_security_group" "frontend" {
  count       = var.crear_frontend ? 1 : 0
  name        = "${var.proyecto}-sg-frontend"
  description = "Frontend: HTTP publico y SSH"
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
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "backend" {
  name        = "${var.proyecto}-sg-backend"
  description = "Backend: API 8000 y SSH. MySQL NO se expone."
  vpc_id      = data.aws_vpc.default.id

  # Sin bloques ingress aqui: todas las reglas de entrada del backend son
  # recursos aws_vpc_security_group_ingress_rule. Mezclar ingress inline con
  # reglas separadas hace que cada apply borre y recree las reglas del 8000.
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# SSH al backend (regla separada: no mezclar con ingress inline)
resource "aws_vpc_security_group_ingress_rule" "ssh_backend" {
  security_group_id = aws_security_group.backend.id
  description       = "SSH"
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
  cidr_ipv4         = var.mi_ip
}

# API abierta a internet (backend "publicado")
resource "aws_vpc_security_group_ingress_rule" "api_publica" {
  count             = var.backend_publico ? 1 : 0
  security_group_id = aws_security_group.backend.id
  description       = "API publica"
  ip_protocol       = "tcp"
  from_port         = 8000
  to_port           = 8000
  cidr_ipv4         = "0.0.0.0/0"
}

# API accesible desde la VM frontend de AWS (por red privada)
resource "aws_vpc_security_group_ingress_rule" "api_desde_frontend" {
  count                        = var.crear_frontend ? 1 : 0
  security_group_id            = aws_security_group.backend.id
  description                  = "API desde el frontend (AWS)"
  ip_protocol                  = "tcp"
  from_port                    = 8000
  to_port                      = 8000
  referenced_security_group_id = aws_security_group.frontend[0].id
}

# API accesible desde un frontend en otra nube (OVH, Azure, GCP...)
resource "aws_vpc_security_group_ingress_rule" "api_desde_externo" {
  count             = var.frontend_ip_externa != "" ? 1 : 0
  security_group_id = aws_security_group.backend.id
  description       = "API desde frontend externo"
  ip_protocol       = "tcp"
  from_port         = 8000
  to_port           = 8000
  cidr_ipv4         = var.frontend_ip_externa
}

# ---------- VM 1: BACKEND + MySQL ----------
resource "aws_instance" "backend" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.tipo_instancia
  subnet_id                   = data.aws_subnets.default.ids[0]
  vpc_security_group_ids      = [aws_security_group.backend.id]
  key_name                    = aws_key_pair.ssh.key_name
  associate_public_ip_address = true

  root_block_device {
    volume_size = 20 # GB (la capa gratuita cubre hasta 30 GB en total)
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/scripts/backend.sh.tftpl", {
    repo_url       = var.repo_url
    repo_rama      = var.repo_rama
    db_password    = random_password.db.result
    jwt_secret     = random_password.jwt.result
    admin_email    = var.admin_email
    admin_password = var.admin_password
    cargar_semilla = var.cargar_semilla
  })
  user_data_replace_on_change = true

  tags = { Name = "${var.proyecto}-backend", rol = "backend" }

  lifecycle {
    ignore_changes = [
      associate_public_ip_address,
    ]
  }
}

# ---------- VM 2: FRONTEND (nginx) ----------
resource "aws_instance" "frontend" {
  count                       = var.crear_frontend ? 1 : 0
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.tipo_instancia
  subnet_id                   = data.aws_subnets.default.ids[0]
  vpc_security_group_ids      = [aws_security_group.frontend[0].id]
  key_name                    = aws_key_pair.ssh.key_name
  associate_public_ip_address = true

  root_block_device {
    volume_size = 10
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/scripts/frontend.sh.tftpl", {
    repo_url  = var.repo_url
    repo_rama = var.repo_rama
    # Misma VPC: nginx habla con el backend por IP PRIVADA (no cambia al reiniciar).
    backend_ip = aws_instance.backend.private_ip
  })
  user_data_replace_on_change = true

  tags = { Name = "${var.proyecto}-frontend", rol = "frontend" }

  lifecycle {
    ignore_changes = [
      associate_public_ip_address,
    ]
  }
}

# ---------- Forzar estado RUNNING (Enciende las instancias si estan stopped) ----------
resource "aws_ec2_instance_state" "backend" {
  instance_id = aws_instance.backend.id
  state       = "running"
}

resource "aws_ec2_instance_state" "frontend" {
  count       = var.crear_frontend ? 1 : 0
  instance_id = aws_instance.frontend[0].id
  state       = "running"
}

