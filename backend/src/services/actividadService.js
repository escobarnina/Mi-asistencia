// Servicio de historial de actividad (RF-09 y RF-10).
// registrar(...) deja un registro en la tabla actividad y le asigna
// automáticamente el módulo activo (si no se indica otro).
// listar(...) devuelve el historial del módulo activo para el administrador.
const { Op } = require('sequelize');
const { Actividad, Modulo, Usuario, Asistencia, SesionClase, Importacion } = require('../models');
const { errorHttp } = require('../core/errors');
const env = require('../config/env');

const MS_DIA = 24 * 60 * 60 * 1000;

async function moduloActivoId() {
  const modulo = await Modulo.findOne({ where: { activo: true } });
  return modulo ? modulo.id : null;
}

async function registrar(
  usuarioId,
  accion,
  { entidad = null, entidadId = null, detalle = null, ip = null, moduloId } = {}
) {
  const modulo_id = moduloId !== undefined ? moduloId : await moduloActivoId();
  return Actividad.create({
    modulo_id,
    usuario_id: usuarioId,
    accion,
    entidad,
    entidad_id: entidadId,
    detalle,
    ip,
  });
}

// Inicio (00:00) de un día 'AAAA-MM-DD' en la zona horaria de la app
// (America/La_Paz, UTC-4 sin horario de verano). Así el día se calcula igual
// que como se guardan los registros, sin depender de la zona del servidor.
function inicioDelDia(fecha, etiqueta) {
  if (typeof fecha !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(fecha)) {
    throw errorHttp(400, `${etiqueta} debe tener el formato AAAA-MM-DD`);
  }
  const inicio = new Date(`${fecha}T00:00:00${env.tzOffset}`);
  const valido = !Number.isNaN(inicio.getTime())
    && new Date(`${fecha}T00:00:00Z`).toISOString().slice(0, 10) === fecha;
  if (!valido) throw errorHttp(400, `${etiqueta} no es una fecha válida`);
  return inicio;
}

// Rango [inicio, fin) de los días pedidos; `fecha` (un solo día) manda sobre desde/hasta.
function rangoDeFechas({ fecha, desde, hasta }) {
  const rango = {};
  if (fecha) {
    const inicio = inicioDelDia(fecha, 'La fecha');
    rango[Op.gte] = inicio;
    rango[Op.lt] = new Date(inicio.getTime() + MS_DIA);
    return rango;
  }
  if (desde) rango[Op.gte] = inicioDelDia(desde, 'La fecha desde');
  if (hasta) {
    rango[Op.lt] = new Date(inicioDelDia(hasta, 'La fecha hasta').getTime() + MS_DIA);
  }
  if (rango[Op.gte] && rango[Op.lt] && rango[Op.gte] >= rango[Op.lt]) {
    throw errorHttp(400, 'La fecha desde no puede ser posterior a la fecha hasta');
  }
  return Object.getOwnPropertySymbols(rango).length ? rango : null;
}

// Escapa \, % y _ para que el texto buscado se tome literalmente en un LIKE.
const textoLike = (texto) => texto.replace(/[\\%_]/g, '\\$&');

// RF-09: texto legible del registro afectado por cada actividad, a partir de los campos que
// ya guarda la tabla (entidad, entidad_id y detalle). Devuelve un Map id de actividad -> texto
// (null si la acción no afecta a un registro, como LOGIN o LOGOUT). Consulta por lotes.
const diaMes = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '');
const fechaLarga = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const estadoTexto = (e) => (e ? e.charAt(0) + e.slice(1).toLowerCase() : e);

async function describirRegistros(actividades) {
  const ids = (entidad) => [
    ...new Set(
      actividades
        .filter((a) => a.entidad && a.entidad.toLowerCase() === entidad && a.entidad_id)
        .map((a) => a.entidad_id)
    ),
  ];

  const [asistencias, importaciones, modulos, usuarios, sesiones] = await Promise.all([
    Asistencia.findAll({
      where: { id: ids('asistencia') },
      include: [
        { model: SesionClase, as: 'sesion', attributes: ['fecha'] },
        { model: Usuario, as: 'estudiante', attributes: ['nombre'] },
      ],
    }),
    Importacion.findAll({ where: { id: ids('importacion') }, attributes: ['id', 'archivo'] }),
    Modulo.findAll({ where: { id: ids('modulo') }, attributes: ['id', 'nombre', 'gestion'] }),
    Usuario.findAll({ where: { id: ids('inscripcion') }, attributes: ['id', 'nombre', 'codigo'] }),
    SesionClase.findAll({ where: { id: ids('sesion_clase') }, attributes: ['id', 'fecha'] }),
  ]);
  const porId = (lista) => new Map(lista.map((x) => [x.id, x]));
  const mAsis = porId(asistencias);
  const mImp = porId(importaciones);
  const mMod = porId(modulos);
  const mUsu = porId(usuarios);
  const mSes = porId(sesiones);

  const textos = new Map();
  for (const a of actividades) {
    const entidad = a.entidad ? a.entidad.toLowerCase() : null;
    let texto = null;
    if (entidad === 'asistencia' && a.entidad_id) {
      const asis = mAsis.get(a.entidad_id);
      if (asis) {
        texto = `Asistencia de ${asis.estudiante.nombre} · ${diaMes(asis.sesion.fecha)}`;
        const cambio = a.accion === 'MODIFICAR_ASISTENCIA' && /^([A-Z]+) → ([A-Z]+)[.]/.exec(a.detalle || '');
        if (cambio) texto += `: ${estadoTexto(cambio[1])} → ${estadoTexto(cambio[2])}`;
      } else {
        texto = `Asistencia #${a.entidad_id}`;
      }
    } else if (entidad === 'importacion' && a.entidad_id) {
      const imp = mImp.get(a.entidad_id);
      texto = `Importación #${a.entidad_id}${imp ? ` (${imp.archivo})` : ''}`;
    } else if (entidad === 'modulo' && a.entidad_id) {
      const mod = mMod.get(a.entidad_id);
      texto = mod ? `Módulo ${mod.nombre}${mod.gestion ? ` (${mod.gestion})` : ''}` : `Módulo #${a.entidad_id}`;
    } else if (entidad === 'inscripcion' && a.entidad_id) {
      const u = mUsu.get(a.entidad_id);
      texto = u ? `${u.nombre} (${u.codigo})` : `Estudiante #${a.entidad_id}`;
    } else if (entidad === 'sesion_clase') {
      const s = a.entidad_id && mSes.get(a.entidad_id);
      texto = s ? `Clase del ${fechaLarga(s.fecha)}` : a.entidad_id ? `Clase #${a.entidad_id}` : 'Varias fechas de clase';
    }
    textos.set(a.id, texto);
  }
  return textos;
}

// RF-10: historial de acciones del MÓDULO ACTIVO. Filtros opcionales:
//   estudiante  nombre o número de registro (contiene)
//   fecha       un día 'AAAA-MM-DD' (día de La Paz); o desde / hasta (rango de días)
//   accion      código exacto de la acción
async function listar({
  estudiante,
  fecha,
  desde,
  hasta,
  accion,
  pagina = 1,
  limite = 20,
} = {}) {
  const page = Math.max(1, Number(pagina) || 1);
  const limit = Math.min(100, Math.max(1, Number(limite) || 20));
  const texto = typeof estudiante === 'string' ? estudiante.trim() : '';
  if (texto.length > 100) throw errorHttp(400, 'El filtro de estudiante es demasiado largo');
  const rango = rangoDeFechas({ fecha, desde, hasta });

  const modulo = await Modulo.findOne({
    where: { activo: true },
    attributes: ['id', 'nombre', 'gestion'],
  });
  const vacio = {
    modulo: null,
    total: 0,
    pagina: page,
    limite: limit,
    totalPaginas: 1,
    actividades: [],
  };
  if (!modulo) return vacio;

  const where = { modulo_id: modulo.id };
  if (accion) where.accion = String(accion);
  if (rango) where.creado_en = rango;

  const whereUsuario = {};
  if (texto) {
    const like = `%${textoLike(texto)}%`;
    whereUsuario[Op.or] = [{ nombre: { [Op.like]: like } }, { codigo: { [Op.like]: like } }];
  }

  const { count, rows } = await Actividad.findAndCountAll({
    where,
    include: [
      { model: Modulo, attributes: ['id', 'nombre', 'gestion'] },
      {
        model: Usuario,
        attributes: ['id', 'nombre', 'email', 'codigo', 'rol'],
        where: texto ? whereUsuario : undefined,
        required: Boolean(texto),
      },
    ],
    order: [['creado_en', 'DESC'], ['id', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });

  const textos = await describirRegistros(rows);

  return {
    modulo: { id: modulo.id, nombre: modulo.nombre, gestion: modulo.gestion },
    total: count,
    pagina: page,
    limite: limit,
    totalPaginas: Math.ceil(count / limit) || 1,
    // Se conservan todos los campos actuales y se suma `registro_afectado` (texto legible).
    actividades: rows.map((r) => ({ ...r.get({ plain: true }), registro_afectado: textos.get(r.id) ?? null })),
  };
}

module.exports = { registrar, moduloActivoId, listar };
