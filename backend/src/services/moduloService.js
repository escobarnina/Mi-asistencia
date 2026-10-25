// Lógica de negocio de módulos (RF-13): crear, listar, editar y activar.
// Regla clave: solo puede haber UN módulo activo a la vez.
const { sequelize, Modulo, Inscripcion, SesionClase } = require('../models');
const { errorHttp } = require('../core/errors');
const actividadService = require('./actividadService');

// Cantidad de estudiantes inscritos y de fechas de clase, calculadas en la misma consulta.
const INSCRITOS = [
  sequelize.literal(
    '(SELECT COUNT(*) FROM inscripcion WHERE inscripcion.modulo_id = Modulo.id)'
  ),
  'inscritos',
];
const FECHAS = [
  sequelize.literal(
    '(SELECT COUNT(*) FROM sesion_clase WHERE sesion_clase.modulo_id = Modulo.id)'
  ),
  'fechas',
];

async function obtener(id) {
  const modulo = await Modulo.findByPk(id, {
    attributes: { include: [INSCRITOS, FECHAS] },
  });
  if (!modulo) throw errorHttp(404, 'Módulo no encontrado');
  return modulo;
}

// El módulo activo va primero; luego los más recientes.
async function listar() {
  return Modulo.findAll({
    attributes: { include: [INSCRITOS, FECHAS] },
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
    attributes: { include: [INSCRITOS, FECHAS] },
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

async function editar(id, datos, usuario = null, ip = null) {
  const modulo = await Modulo.findByPk(id);
  if (!modulo) throw errorHttp(404, 'Módulo no encontrado');
  // Un módulo reemplazado es historia (RN-08): no se renombra.
  if (!modulo.activo && modulo.activado_en) {
    throw errorHttp(409, `El módulo "${modulo.nombre}" ya se usó y fue reemplazado; no se puede modificar`);
  }

  const nombre = datos.nombre !== undefined ? datos.nombre : modulo.nombre;
  const gestion = datos.gestion !== undefined ? datos.gestion : modulo.gestion;
  await verificarDuplicado(nombre, gestion, modulo.id);

  const antes = `${modulo.nombre}${modulo.gestion ? ` (${modulo.gestion})` : ''}`;
  const despues = `${nombre}${gestion ? ` (${gestion})` : ''}`;
  await modulo.update({ nombre, gestion: gestion || null });
  if (usuario && antes !== despues) {
    await actividadService.registrar(usuario.id, 'EDITAR_MODULO', {
      entidad: 'modulo',
      entidadId: modulo.id,
      detalle: `${antes} → ${despues}`,
      ip,
      moduloId: modulo.id,
    });
  }
  return obtener(modulo.id);
}

// RF-13: un módulo solo se activa si ya tiene estudiantes y fechas de clase.
async function exigirDatosCompletos(modulo, transaction) {
  const [inscritos, fechas] = await Promise.all([
    Inscripcion.count({ where: { modulo_id: modulo.id }, transaction }),
    SesionClase.count({ where: { modulo_id: modulo.id }, transaction }),
  ]);
  const faltan = [];
  if (inscritos === 0) faltan.push('estudiantes inscritos');
  if (fechas === 0) faltan.push('fechas de clase');
  if (faltan.length) {
    throw errorHttp(
      400,
      `No se puede activar "${modulo.nombre}": todavía no tiene ${faltan.join(' ni ')}. ` +
        'Importa los datos antes de activarlo'
    );
  }
  return { inscritos, fechas };
}

// Activa un módulo y desactiva el resto, todo en una sola transacción.
// Los datos del módulo anterior no se tocan: solo deja de estar activo (RN-08).
// Primero se desactivan los demás para respetar el UNIQUE de la base
// (columna generada activo_unico) y nunca quedar con dos activos.
async function activar(id, usuario, ip) {
  let resumen = null;
  const yaActivo = await sequelize.transaction(async (t) => {
    const modulo = await Modulo.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!modulo) throw errorHttp(404, 'Módulo no encontrado');
    if (modulo.activo) return true;
    resumen = await exigirDatosCompletos(modulo, t);

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
      detalle: `Módulo activado (${resumen.inscritos} estudiantes, ${resumen.fechas} fechas)`,
      ip,
      moduloId: id,
    });
  }
  return obtener(id);
}

module.exports = { listar, obtener, obtenerActivo, crear, editar, activar };
