// Lógica de negocio de módulos (RF-13): crear, listar, editar y activar.
// Regla clave: solo puede haber UN módulo activo a la vez.
const { sequelize, Modulo } = require('../models');
const { errorHttp } = require('../core/errors');
const actividadService = require('./actividadService');

// Cantidad de estudiantes inscritos, calculada en la misma consulta.
const INSCRITOS = [
  sequelize.literal(
    '(SELECT COUNT(*) FROM inscripcion WHERE inscripcion.modulo_id = Modulo.id)'
  ),
  'inscritos',
];

async function obtener(id) {
  const modulo = await Modulo.findByPk(id, {
    attributes: { include: [INSCRITOS] },
  });
  if (!modulo) throw errorHttp(404, 'Módulo no encontrado');
  return modulo;
}

// El módulo activo va primero; luego los más recientes.
async function listar() {
  return Modulo.findAll({
    attributes: { include: [INSCRITOS] },
    order: [
      ['activo', 'DESC'],
      ['creado_en', 'DESC'],
      ['id', 'DESC'],
    ],
  });
}

async function obtenerActivo() {
  return Modulo.findOne({
    where: { activo: true },
    attributes: { include: [INSCRITOS] },
  });
}

async function verificarDuplicado(nombre, gestion, ignorarId = null) {
  const existentes = await Modulo.findAll({
    where: { nombre, gestion: gestion || null },
    attributes: ['id'],
  });
  if (existentes.some((m) => m.id !== ignorarId)) {
    throw errorHttp(409, 'Ya existe un módulo con ese nombre y gestión');
  }
}

// Los módulos nuevos se crean inactivos; se activan con activar().
async function crear({ nombre, gestion }, usuario) {
  await verificarDuplicado(nombre, gestion);
  const modulo = await Modulo.create({
    nombre,
    gestion: gestion || null,
    activo: false,
    creado_por: usuario.id,
  });
  return obtener(modulo.id);
}

async function editar(id, datos) {
  const modulo = await Modulo.findByPk(id);
  if (!modulo) throw errorHttp(404, 'Módulo no encontrado');

  const nombre = datos.nombre !== undefined ? datos.nombre : modulo.nombre;
  const gestion = datos.gestion !== undefined ? datos.gestion : modulo.gestion;
  await verificarDuplicado(nombre, gestion, modulo.id);

  await modulo.update({ nombre, gestion: gestion || null });
  return obtener(modulo.id);
}

// Activa un módulo y desactiva el resto, todo en una sola transacción.
// Primero se desactivan los demás para respetar el UNIQUE de la base
// (columna generada activo_unico) y nunca quedar con dos activos.
async function activar(id, usuario, ip) {
  const yaActivo = await sequelize.transaction(async (t) => {
    const modulo = await Modulo.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!modulo) throw errorHttp(404, 'Módulo no encontrado');
    if (modulo.activo) return true;

    await Modulo.update(
      { activo: false },
      { where: { activo: true }, transaction: t }
    );
    await modulo.update(
      { activo: true, activado_en: new Date() },
      { transaction: t }
    );
    return false;
  });

  // Solo se deja historial si hubo un cambio real.
  if (!yaActivo) {
    await actividadService.registrar(usuario.id, 'ACTIVAR_MODULO', {
      entidad: 'modulo',
      entidadId: id,
      detalle: 'Módulo activado',
      ip,
      moduloId: id,
    });
  }
  return obtener(id);
}

module.exports = { listar, obtener, obtenerActivo, crear, editar, activar };
