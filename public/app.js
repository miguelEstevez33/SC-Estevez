const { jsPDF } = window.jspdf;

let tanquesActuales = [];
let precios = { Super: 0, Euro: 0, Gasoil: 0 };
let cierresUltimos7Dias = [];
let diaActivoTab = null;
let contadorFilasVenta = 0;
let guardandoCierre = false;
let ultimoInformeMensualCargado = null;

window.addEventListener('DOMContentLoaded', async () => {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');

  document.getElementById('fecha').value = `${yyyy}-${mm}-${dd}`;
  document.getElementById('mes_informe').value = `${yyyy}-${mm}`;

  agregarFilaVenta('Efectivo');

  await cargarTanques();
  mostrarVista('vista-menu');
});

// ==========================================
// NAVEGACIÓN ENTRE VISTAS
// ==========================================
async function mostrarVista(idVista) {
  const vistas = [
    'vista-menu',
    'vista-cerrar-caja',
    'vista-informes-diarios',
    'vista-informes-mensuales',
    'vista-cargar-tanque'
  ];

  vistas.forEach(v => document.getElementById(v).classList.add('hidden'));
  document.getElementById(idVista).classList.remove('hidden');

  if (idVista === 'vista-menu' || idVista === 'vista-cerrar-caja' || idVista === 'vista-cargar-tanque') {
    await cargarTanques();
  }
  if (idVista === 'vista-informes-diarios') {
    await cargarInformesDiarios();
  }
  if (idVista === 'vista-informes-mensuales') {
    await cargarVistaPreviaMensual();
  }
}

function val(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const num = parseFloat(el.value) || 0;
  if (num < 0) {
    el.value = 0;
    return 0;
  }
  return num;
}

function escaparHTML(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatoMoneda(num) {
  return `$ ${Number(num || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ==========================================
// GESTIÓN DE TANQUES Y PRECIOS
// ==========================================
function obtenerSurtidorGuardado(tanque) {
  const rawLocal = localStorage.getItem(`surtidor_hist_${tanque.combustible}`);
  const dbVal = Number(tanque.surtidor_actual || 0);
  if (rawLocal !== null) {
    return Number(rawLocal) || 0;
  }
  if (dbVal > 0) {
    localStorage.setItem(`surtidor_hist_${tanque.combustible}`, String(dbVal));
    return dbVal;
  }
  return 0;
}

async function cargarTanques() {
  const res = await fetch(`/api/tanques?t=${Date.now()}`, { cache: 'no-store' });
  tanquesActuales = await res.json();

  tanquesActuales.forEach(t => {
    precios[t.combustible] = t.precio_litro;
    t.surtidor_actual = obtenerSurtidorGuardado(t);
  });

  // 1. Resumen en Menú Principal
  const contInicio = document.getElementById('resumen-tanques-inicio');
  if (contInicio) {
    contInicio.innerHTML = tanquesActuales.map(t => {
      const bajo = t.litros_disponibles < 2000;
      const numSurtidor = Number(t.surtidor_actual || 0);
      return `
        <div class="p-4 rounded-2xl border-2 ${bajo ? 'border-amber-600 bg-amber-100/80' : 'border-emerald-700/40 bg-[#e6eeea]'} flex justify-between items-center">
          <div>
            <span class="text-sm font-extrabold uppercase text-slate-600">${t.combustible}</span>
            <p class="text-3xl font-black ${bajo ? 'text-amber-800' : 'text-emerald-900'}">
              ${t.litros_disponibles.toLocaleString('es-AR', { minimumFractionDigits: 1 })} L
            </p>
            <p class="text-xs font-bold text-slate-600 mt-1 font-mono">Surtidor: ${numSurtidor}</p>
          </div>
          <span class="text-sm font-bold text-slate-700">${formatoMoneda(t.precio_litro)}/L</span>
        </div>
      `;
    }).join('');
  }

  // 2. Etiquetas y Surtidores en Cerrar Caja
  const stockMap = Object.fromEntries(tanquesActuales.map(t => [t.combustible, t.litros_disponibles]));
  const surtidorMap = Object.fromEntries(tanquesActuales.map(t => [t.combustible, Number(t.surtidor_actual || 0)]));

  document.getElementById('badge_precio_super').textContent = `${formatoMoneda(precios.Super)} / L`;
  document.getElementById('badge_precio_euro').textContent = `${formatoMoneda(precios.Euro)} / L`;
  document.getElementById('badge_precio_gasoil').textContent = `${formatoMoneda(precios.Gasoil)} / L`;

  document.getElementById('disp_stock_super').textContent = `${(stockMap['Super'] || 0).toLocaleString('es-AR')} L`;
  document.getElementById('disp_stock_euro').textContent = `${(stockMap['Euro'] || 0).toLocaleString('es-AR')} L`;
  document.getElementById('disp_stock_gasoil').textContent = `${(stockMap['Gasoil'] || 0).toLocaleString('es-AR')} L`;

  document.getElementById('surtidor_ant_super').value = surtidorMap['Super'] ?? 0;
  document.getElementById('surtidor_ant_euro').value = surtidorMap['Euro'] ?? 0;
  document.getElementById('surtidor_ant_gasoil').value = surtidorMap['Gasoil'] ?? 0;

  // 3. Tarjetas en Vista Cargar Tanque
  const panelGestion = document.getElementById('panel-gestion-tanques');
  if (panelGestion) {
    panelGestion.innerHTML = tanquesActuales.map(t => `
      <div class="bg-[#f2f6f4] border-2 border-emerald-700 rounded-2xl p-6 shadow-sm space-y-4">
        <div class="text-center border-b-2 border-slate-300/60 pb-3">
          <h3 class="text-2xl font-black text-emerald-900 uppercase">${t.combustible}</h3>
          <p class="text-sm font-bold text-slate-600 mt-1">Stock actual en tanque:</p>
          <p class="text-4xl font-black text-slate-900 mt-1">${t.litros_disponibles.toLocaleString('es-AR', { minimumFractionDigits: 1 })} L</p>
          <p class="text-xs font-bold text-emerald-800 mt-1 font-mono">Surtidor actual: ${Number(t.surtidor_actual || 0)}</p>
        </div>

        <div>
          <label class="block text-sm font-bold text-slate-700 mb-1">Cantidad de Litros:</label>
          <input type="number" id="ajuste_litros_${t.combustible}" min="0" step="0.01" placeholder="0.00"
            class="w-full bg-[#f7faf8] border-2 border-slate-400 focus:border-emerald-700 focus:outline-none rounded-xl p-3 text-2xl font-bold text-right">
        </div>

        <div class="grid grid-cols-1 gap-2 pt-1">
          <button onclick="ajustarTanque('${t.combustible}', 'agregar')" class="bg-emerald-700 hover:bg-emerald-800 text-[#f2f6f4] font-black py-3 px-4 rounded-xl text-lg transition">
            + AGREGAR LITROS
          </button>
          <button onclick="ajustarTanque('${t.combustible}', 'restar')" class="bg-amber-700 hover:bg-amber-800 text-[#f2f6f4] font-black py-3 px-4 rounded-xl text-lg transition">
            - RESTAR LITROS
          </button>
          <button onclick="ajustarTanque('${t.combustible}', 'modificar')" class="bg-slate-700 hover:bg-slate-800 text-[#f2f6f4] font-black py-3 px-4 rounded-xl text-lg transition">
            = FIJAR STOCK EXACTO
          </button>
        </div>

        <div class="border-t-2 border-slate-300/60 pt-3 space-y-2">
          <label class="block text-xs font-extrabold text-emerald-900 uppercase">Histórico Surtidor (6 dígitos):</label>
          <div class="flex gap-2">
            <input type="number" id="ajuste_surtidor_${t.combustible}" min="0" step="any" value="${Number(t.surtidor_actual || 0)}"
              class="flex-1 bg-[#f7faf8] border-2 border-slate-400 focus:border-emerald-700 focus:outline-none rounded-xl p-2.5 text-lg font-black text-right font-mono">
            <button type="button" onclick="fijarSurtidorTanque('${t.combustible}')"
              class="bg-emerald-800 hover:bg-emerald-900 text-[#f2f6f4] font-black px-4 py-2.5 rounded-xl text-sm transition shrink-0">
              FIJAR
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  document.getElementById('input_precio_super').value = precios.Super;
  document.getElementById('input_precio_euro').value = precios.Euro;
  document.getElementById('input_precio_gasoil').value = precios.Gasoil;

  // Recalcular montos de filas si hay litros cargados
  document.querySelectorAll('#lista-ventas-rendicion > div').forEach(fila => {
    const idFila = fila.id;
    if (idFila) calcularMontoFila(idFila);
  });
}

async function ajustarTanque(combustible, operacion) {
  const input = document.getElementById(`ajuste_litros_${combustible}`);
  const litros = parseFloat(input.value);

  if (isNaN(litros) || litros < 0 || (operacion !== 'modificar' && litros === 0)) {
    return alert('Ingrese una cantidad de litros válida mayor a 0.');
  }

  if (operacion === 'modificar' && !confirm(`¿Seguro que desea fijar el stock total de ${combustible} en ${litros} L?`)) {
    return;
  }

  const res = await fetch('/api/tanques/ajustar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ combustible, operacion, litros })
  });

  if (res.ok) {
    input.value = '';
    await cargarTanques();
  } else {
    const err = await res.json();
    alert(err.error || 'Error al actualizar tanque');
  }
}

async function fijarSurtidorTanque(combustible) {
  const input = document.getElementById(`ajuste_surtidor_${combustible}`);
  const surtidor = parseFloat(input.value);

  if (isNaN(surtidor) || surtidor < 0) {
    return alert('Ingrese un número de surtidor válido (mayor o igual a 0).');
  }

  localStorage.setItem(`surtidor_hist_${combustible}`, String(surtidor));

  try {
    await fetch('/api/tanques/surtidor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ combustible, surtidor })
    });
  } catch (_) {}

  await cargarTanques();
  alert(`Histórico de surtidor de ${combustible} fijado en ${surtidor}.`);
}

async function guardarPrecios() {
  const Super = parseFloat(document.getElementById('input_precio_super').value);
  const Euro = parseFloat(document.getElementById('input_precio_euro').value);
  const Gasoil = parseFloat(document.getElementById('input_precio_gasoil').value);

  if (!Super || !Euro || !Gasoil || Super <= 0 || Euro <= 0 || Gasoil <= 0) {
    return alert('Ingrese precios válidos mayores a 0.');
  }

  await fetch('/api/tanques/precios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Super, Euro, Gasoil })
  });

  await cargarTanques();
  alert('Precios actualizados correctamente.');
}

// ==========================================
// FILAS DINÁMICAS DE RENDICIÓN
// ==========================================
function agregarFilaVenta(tipoPorDefecto = 'Efectivo') {
  contadorFilasVenta++;
  const idFila = `fila-venta-${contadorFilasVenta}`;
  const contenedor = document.getElementById('lista-ventas-rendicion');

  const usaLitrosInicial = !['Efectivo', 'Transferencia'].includes(tipoPorDefecto);
  const esOtroInicial = tipoPorDefecto === 'Otro';

  const fila = document.createElement('div');
  fila.id = idFila;
  fila.className = 'bg-[#f2f6f4] border-2 border-emerald-700/40 rounded-xl p-4 space-y-3 shadow-sm overflow-hidden';

  fila.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <select onchange="onCambiarTipoVenta('${idFila}')"
        class="venta-select flex-1 min-w-[160px] bg-[#f7faf8] border-2 border-emerald-700 rounded-xl px-4 py-3 text-lg font-extrabold text-emerald-950 focus:outline-none">
        <option value="Efectivo" ${tipoPorDefecto === 'Efectivo' ? 'selected' : ''}>Efectivo</option>
        <option value="Policía" ${tipoPorDefecto === 'Policía' ? 'selected' : ''}>Policía</option>
        <option value="Comuna" ${tipoPorDefecto === 'Comuna' ? 'selected' : ''}>Comuna</option>
        <option value="Bomberos" ${tipoPorDefecto === 'Bomberos' ? 'selected' : ''}>Bomberos</option>
        <option value="Cooperativa" ${tipoPorDefecto === 'Cooperativa' ? 'selected' : ''}>Cooperativa</option>
        <option value="Transferencia" ${tipoPorDefecto === 'Transferencia' ? 'selected' : ''}>Transferencia</option>
        <option value="Otro" ${tipoPorDefecto === 'Otro' ? 'selected' : ''}>Otro</option>
      </select>

      <div class="flex items-center gap-2">
        <span class="text-xl font-black text-slate-600">$</span>
        <input type="number" step="0.01" min="0" placeholder="0.00" oninput="recalcular()"
          class="venta-monto w-36 sm:w-44 bg-[#f7faf8] border-2 border-slate-400 focus:border-emerald-700 focus:outline-none rounded-xl p-3 text-2xl font-black text-right text-slate-900">
        <button type="button" onclick="eliminarFilaVenta('${idFila}')"
          class="bg-red-700 hover:bg-red-800 text-white font-black px-4 py-3 rounded-xl text-lg transition shrink-0" title="Eliminar fila">
          ✕
        </button>
      </div>
    </div>

    <input type="text" placeholder="Nombre del concepto (ej: Cuenta Corriente, Mercado Pago, Vale...)"
      class="venta-otro-nombre ${esOtroInicial ? '' : 'hidden'} w-full bg-[#f7faf8] border-2 border-emerald-700/60 focus:border-emerald-700 focus:outline-none rounded-xl px-4 py-2.5 text-base font-bold text-slate-900">

    <!-- SECCIÓN DE LITROS Y COMBUSTIBLE (Visible en Policía, Comuna, Bomberos, Cooperativa, Otro) -->
    <div class="venta-seccion-litros ${usaLitrosInicial ? '' : 'hidden'} grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#e6eeea] p-3 rounded-xl border border-emerald-700/30">
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Combustible del Vale:</label>
        <select onchange="calcularMontoFila('${idFila}')" class="venta-combustible w-full bg-white border border-slate-400 rounded-lg p-2 font-bold text-sm text-slate-800 focus:outline-none focus:border-emerald-700">
          <option value="Super">Super</option>
          <option value="Euro">Euro</option>
          <option value="Gasoil">Gasoil</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Litros Cargados:</label>
        <input type="number" step="0.01" min="0" placeholder="0.00 L" oninput="calcularMontoFila('${idFila}')"
          class="venta-litros w-full bg-white border border-slate-400 rounded-lg p-2 font-black text-right text-sm text-slate-900 focus:outline-none focus:border-emerald-700">
      </div>
    </div>

    <input type="text" placeholder="Pequeña descripción (opcional: móvil, patente, chofer, N° vale...)"
      class="venta-desc w-full bg-[#f7faf8] border border-slate-400 focus:border-emerald-700 focus:outline-none rounded-xl px-4 py-2 text-base font-medium text-slate-700">
  `;

  contenedor.appendChild(fila);
}

function onCambiarTipoVenta(idFila) {
  const fila = document.getElementById(idFila);
  if (!fila) return;
  const select = fila.querySelector('.venta-select');
  const inputOtroNombre = fila.querySelector('.venta-otro-nombre');
  const seccionLitros = fila.querySelector('.venta-seccion-litros');

  const tipo = select.value;
  const esOtro = tipo === 'Otro';
  const usaLitros = !['Efectivo', 'Transferencia'].includes(tipo);

  if (esOtro) {
    inputOtroNombre.classList.remove('hidden');
    inputOtroNombre.focus();
  } else {
    inputOtroNombre.classList.add('hidden');
    inputOtroNombre.value = '';
  }

  if (usaLitros) {
    seccionLitros.classList.remove('hidden');
    calcularMontoFila(idFila);
  } else {
    seccionLitros.classList.add('hidden');
    fila.querySelector('.venta-litros').value = '';
    recalcular();
  }
}

function calcularMontoFila(idFila) {
  const fila = document.getElementById(idFila);
  if (!fila) return;
  const select = fila.querySelector('.venta-select');
  const tipo = select.value;

  if (['Efectivo', 'Transferencia'].includes(tipo)) return;

  const combustible = fila.querySelector('.venta-combustible').value;
  const litros = parseFloat(fila.querySelector('.venta-litros').value) || 0;
  const precioUnitario = precios[combustible] || 0;

  const montoTotal = Number((litros * precioUnitario).toFixed(2));
  fila.querySelector('.venta-monto').value = montoTotal;
  recalcular();
}

function eliminarFilaVenta(idFila) {
  const fila = document.getElementById(idFila);
  if (fila) fila.remove();

  if (document.querySelectorAll('#lista-ventas-rendicion > div').length === 0) {
    agregarFilaVenta('Efectivo');
  }
  recalcular();
}

function obtenerDetalleRendicion() {
  const filas = document.querySelectorAll('#lista-ventas-rendicion > div');
  let efectivo = 0;
  let policia = 0;
  let comuna = 0;
  let bomberos = 0;
  let cooperativa = 0;
  let transferencia = 0;
  let otro = 0;
  const itemsDetallados = [];

  filas.forEach(f => {
    const categoria = f.querySelector('.venta-select').value;
    const nombrePersonalizado = f.querySelector('.venta-otro-nombre').value.trim();
    const inputMonto = f.querySelector('.venta-monto');
    let monto = parseFloat(inputMonto.value) || 0;
    if (monto < 0) {
      monto = 0;
      inputMonto.value = 0;
    }
    const descripcion = f.querySelector('.venta-desc').value.trim();

    const usaLitros = !['Efectivo', 'Transferencia'].includes(categoria);
    let combustible = null;
    let litros = 0;

    if (usaLitros) {
      combustible = f.querySelector('.venta-combustible').value;
      litros = parseFloat(f.querySelector('.venta-litros').value) || 0;
    }

    if (monto > 0 || litros > 0 || descripcion !== '' || nombrePersonalizado !== '') {
      const etiqueta = (categoria === 'Otro' && nombrePersonalizado) ? nombrePersonalizado : categoria;

      if (categoria === 'Efectivo') efectivo += monto;
      else if (categoria === 'Policía') policia += monto;
      else if (categoria === 'Comuna') comuna += monto;
      else if (categoria === 'Bomberos') bomberos += monto;
      else if (categoria === 'Cooperativa') cooperativa += monto;
      else if (categoria === 'Transferencia') transferencia += monto;
      else otro += monto;

      itemsDetallados.push({
        categoria,
        tipo: etiqueta,
        monto: Number(monto.toFixed(2)),
        combustible,
        litros: Number(litros.toFixed(2)),
        descripcion
      });
    }
  });

  return {
    efectivo: Number(efectivo.toFixed(2)),
    policia: Number(policia.toFixed(2)),
    comuna: Number(comuna.toFixed(2)),
    bomberos: Number(bomberos.toFixed(2)),
    cooperativa: Number(cooperativa.toFixed(2)),
    transferencia: Number(transferencia.toFixed(2)),
    otro: Number(otro.toFixed(2)),
    itemsDetallados
  };
}

// ==========================================
// CERRAR CAJA Y CÁLCULOS
// ==========================================
function calcularPorSurtidor(tipo) {
  const inputAnt = document.getElementById(`surtidor_ant_${tipo}`);
  const inputAct = document.getElementById(`surtidor_act_${tipo}`);
  const inputLitros = document.getElementById(`litros_${tipo}`);
  const infoEl = document.getElementById(`info_calculo_${tipo}`);

  const strAct = inputAct.value.trim();
  if (strAct === '') {
    inputLitros.value = '';
    infoEl.textContent = '';
    infoEl.className = 'text-xs font-bold text-emerald-800 text-right min-h-[16px]';
    recalcular();
    return;
  }

  const ant = parseFloat(inputAnt.value) || 0;
  const act = parseFloat(strAct) || 0;
  const diff = Number((act - ant).toFixed(2));

  if (diff < 0) {
    inputLitros.value = 0;
    infoEl.textContent = `⚠ Cierre actual (${act}) menor al anterior (${ant})`;
    infoEl.className = 'text-xs font-extrabold text-red-700 text-right min-h-[16px]';
  } else {
    inputLitros.value = diff;
    infoEl.textContent = `${act} - ${ant} = ${diff} L`;
    infoEl.className = 'text-xs font-bold text-emerald-800 text-right min-h-[16px]';
  }

  recalcular();
}

function calcularValoresVenta() {
  const lSuper = val('litros_super');
  const lEuro = val('litros_euro');
  const lGasoil = val('litros_gasoil');

  const vSuper = Number((lSuper * precios.Super).toFixed(2));
  const vEuro = Number((lEuro * precios.Euro).toFixed(2));
  const vGasoil = Number((lGasoil * precios.Gasoil).toFixed(2));

  return { lSuper, vSuper, lEuro, vEuro, lGasoil, vGasoil };
}

function recalcular() {
  const { vSuper, vEuro, vGasoil } = calcularValoresVenta();

  document.getElementById('display_valor_super').textContent = formatoMoneda(vSuper);
  document.getElementById('display_valor_euro').textContent = formatoMoneda(vEuro);
  document.getElementById('display_valor_gasoil').textContent = formatoMoneda(vGasoil);

  const totalVenta = Number((vSuper + vEuro + vGasoil).toFixed(2));
  const r = obtenerDetalleRendicion();
  const totalNormalizado = Number((
    r.efectivo + r.policia + r.comuna + r.bomberos + r.cooperativa + r.transferencia + r.otro
  ).toFixed(2));

  document.getElementById('display_total_venta').textContent = formatoMoneda(totalVenta);
  document.getElementById('display_total_normalizado').textContent = formatoMoneda(totalNormalizado);

  const estadoDiv = document.getElementById('estado_cuadre');
  const diferencia = Math.abs(totalVenta - totalNormalizado);

  if (totalVenta === 0 && totalNormalizado === 0) {
    estadoDiv.className = 'p-4 rounded-xl text-center font-bold text-lg bg-[#d4dfd9] text-slate-700';
    estadoDiv.textContent = 'Ingrese los litros y medios de pago';
  } else if (diferencia < 0.01) {
    estadoDiv.className = 'p-4 rounded-xl text-center font-extrabold text-lg bg-emerald-200/80 text-emerald-950 border-2 border-emerald-700';
    estadoDiv.textContent = 'CAJA CUADRADA CORRECTAMENTE';
  } else {
    const diffReal = totalNormalizado - totalVenta;
    const signo = diffReal > 0 ? '+' : '';
    estadoDiv.className = 'p-4 rounded-xl text-center font-extrabold text-lg bg-amber-200/80 text-amber-950 border-2 border-amber-600';
    estadoDiv.textContent = `DIFERENCIA DE CAJA: ${signo}${formatoMoneda(diffReal)}`;
  }
}

async function guardarCierre() {
  if (guardandoCierre) return;

  const { lSuper, vSuper, lEuro, vEuro, lGasoil, vGasoil } = calcularValoresVenta();
  const totalVenta = Number((vSuper + vEuro + vGasoil).toFixed(2));
  const r = obtenerDetalleRendicion();
  const totalNormalizado = Number((
    r.efectivo + r.policia + r.comuna + r.bomberos + r.cooperativa + r.transferencia + r.otro
  ).toFixed(2));

  const surtidorAntSuper = val('surtidor_ant_super');
  const surtidorActSuper = val('surtidor_act_super');
  const surtidorAntEuro = val('surtidor_ant_euro');
  const surtidorActEuro = val('surtidor_act_euro');
  const surtidorAntGasoil = val('surtidor_ant_gasoil');
  const surtidorActGasoil = val('surtidor_act_gasoil');

  if ((surtidorActSuper > 0 && surtidorActSuper < surtidorAntSuper) ||
      (surtidorActEuro > 0 && surtidorActEuro < surtidorAntEuro) ||
      (surtidorActGasoil > 0 && surtidorActGasoil < surtidorAntGasoil)) {
    return alert('El número de cierre actual del surtidor no puede ser menor al histórico anterior.');
  }

  const datos = {
    fecha: document.getElementById('fecha').value,
    litros_super: lSuper,
    valor_super: vSuper,
    litros_euro: lEuro,
    valor_euro: vEuro,
    litros_gasoil: lGasoil,
    valor_gasoil: vGasoil,
    surtidor_ant_super: surtidorAntSuper,
    surtidor_act_super: surtidorActSuper,
    surtidor_ant_euro: surtidorAntEuro,
    surtidor_act_euro: surtidorActEuro,
    surtidor_ant_gasoil: surtidorAntGasoil,
    surtidor_act_gasoil: surtidorActGasoil,
    total_venta: totalVenta,
    efectivo: r.efectivo,
    policia: r.policia,
    comuna: r.comuna,
    bomberos: r.bomberos,
    cooperativa: r.cooperativa,
    transferencia: r.transferencia,
    otro: r.otro,
    medios_extra: r.itemsDetallados,
    total_normalizado: totalNormalizado
  };

  if (!datos.fecha) return alert('Seleccione una fecha válida.');
  if (datos.total_venta <= 0) return alert('Debe ingresar al menos una venta en litros antes de cerrar.');

  const diferencia = Math.abs(totalVenta - totalNormalizado);
  if (diferencia >= 0.01) {
    const confirmarDiff = confirm(`Atención: Hay una diferencia entre el Total Venta (${formatoMoneda(totalVenta)}) y el Total Normalizado (${formatoMoneda(totalNormalizado)}).\n\n¿Desea guardar el cierre de todas formas?`);
    if (!confirmarDiff) return;
  }

  try {
    guardandoCierre = true;
    const res = await fetch('/api/cierres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });

    const resultado = await res.json();
    if (!res.ok) {
      return alert(`Error: ${resultado.error}`);
    }

    if (surtidorActSuper > 0) localStorage.setItem('surtidor_hist_Super', String(surtidorActSuper));
    if (surtidorActEuro > 0) localStorage.setItem('surtidor_hist_Euro', String(surtidorActEuro));
    if (surtidorActGasoil > 0) localStorage.setItem('surtidor_hist_Gasoil', String(surtidorActGasoil));

    generarComprobantePDF(datos, resultado.id);

    await cargarTanques();
    ['litros_super', 'litros_euro', 'litros_gasoil', 'surtidor_act_super', 'surtidor_act_euro', 'surtidor_act_gasoil'].forEach(id => {
      document.getElementById(id).value = '';
    });
    ['info_calculo_super', 'info_calculo_euro', 'info_calculo_gasoil'].forEach(id => {
      document.getElementById(id).textContent = '';
    });

    document.getElementById('lista-ventas-rendicion').innerHTML = '';
    agregarFilaVenta('Efectivo');
    recalcular();
  } finally {
    guardandoCierre = false;
  }
}

// ==========================================
// INFORMES DIARIOS (ÚLTIMOS 7 DÍAS + ANULAR)
// ==========================================
async function cargarInformesDiarios() {
  const res = await fetch(`/api/cierres/ultimos-7-dias?t=${Date.now()}`, { cache: 'no-store' });
  cierresUltimos7Dias = await res.json();

  const tabsCont = document.getElementById('tabs-dias');
  const contenidoCont = document.getElementById('contenido-dia-seleccionado');

  if (cierresUltimos7Dias.length === 0) {
    diaActivoTab = null;
    tabsCont.innerHTML = '';
    contenidoCont.innerHTML = `
      <div class="bg-[#f2f6f4] border-2 border-emerald-700/30 rounded-2xl p-10 text-center text-slate-600 text-xl font-bold">
        Aún no hay cierres de caja registrados.
      </div>
    `;
    return;
  }

  const fechasUnicas = [...new Set(cierresUltimos7Dias.map(c => c.fecha))];
  if (!diaActivoTab || !fechasUnicas.includes(diaActivoTab)) {
    diaActivoTab = fechasUnicas[0];
  }

  tabsCont.innerHTML = fechasUnicas.map(fecha => {
    const activa = fecha === diaActivoTab;
    return `
      <button onclick="seleccionarDiaTab('${fecha}')"
        class="py-4 px-6 rounded-2xl font-black text-lg transition border-2 ${
          activa
            ? 'bg-emerald-700 text-[#f2f6f4] border-emerald-800 shadow-md'
            : 'bg-[#f2f6f4] text-emerald-900 border-emerald-700 hover:bg-[#e6eeea]'
        }">
        ${fecha}
      </button>
    `;
  }).join('');

  renderizarDetalleDia(diaActivoTab);
}

function seleccionarDiaTab(fecha) {
  diaActivoTab = fecha;
  cargarInformesDiarios();
}

function descargarPDFPorId(idCierre) {
  const cierre = cierresUltimos7Dias.find(c => c.id === idCierre);
  if (cierre) generarComprobantePDF(cierre, cierre.id);
}

async function anularCierre(idCierre) {
  if (!confirm(`¿Seguro que desea ANULAR el Comprobante #${idCierre}?\n\nLos litros vendidos volverán a sumarse automáticamente a los tanques.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/cierres/${idCierre}/anular`, { method: 'POST' });
    const texto = await res.text();
    let data = {};
    try { data = JSON.parse(texto); } catch (_) {}

    if (!res.ok) {
      return alert(data.error || `Error del servidor (${res.status}). Asegúrese de reiniciar node server.js.`);
    }

    const cierreAnulado = cierresUltimos7Dias.find(c => c.id === idCierre);
    if (cierreAnulado) {
      if (cierreAnulado.surtidor_act_super > 0) localStorage.setItem('surtidor_hist_Super', String(cierreAnulado.surtidor_ant_super || 0));
      if (cierreAnulado.surtidor_act_euro > 0) localStorage.setItem('surtidor_hist_Euro', String(cierreAnulado.surtidor_ant_euro || 0));
      if (cierreAnulado.surtidor_act_gasoil > 0) localStorage.setItem('surtidor_hist_Gasoil', String(cierreAnulado.surtidor_ant_gasoil || 0));
    }

    await cargarTanques();
    await cargarInformesDiarios();
  } catch (err) {
    alert('Error de conexión al intentar anular el cierre: ' + err.message);
  }
}

function renderizarDetalleDia(fecha) {
  const cierresDelDia = cierresUltimos7Dias.filter(c => c.fecha === fecha);
  const contenidoCont = document.getElementById('contenido-dia-seleccionado');

  contenidoCont.innerHTML = cierresDelDia.map(c => {
    const items = c.medios_extra || [];
    const desgloseHtml = items.length > 0
      ? items.map(item => `
          <div class="flex justify-between items-start border-b border-slate-300 pb-1">
            <div>
              <span>${escaparHTML(item.tipo)}:</span>
              ${item.combustible && item.litros ? `<span class="block text-xs font-bold text-emerald-800">${item.litros} L de ${item.combustible}</span>` : ''}
              ${item.descripcion ? `<span class="block text-xs font-normal text-slate-600">${escaparHTML(item.descripcion)}</span>` : ''}
            </div>
            <span>${formatoMoneda(item.monto)}</span>
          </div>
        `).join('')
      : `
          <div class="flex justify-between border-b border-slate-300 pb-1"><span>Efectivo:</span><span>${formatoMoneda(c.efectivo)}</span></div>
          <div class="flex justify-between border-b border-slate-300 pb-1"><span>Policía:</span><span>${formatoMoneda(c.policia)}</span></div>
          <div class="flex justify-between border-b border-slate-300 pb-1"><span>Comuna:</span><span>${formatoMoneda(c.comuna)}</span></div>
          <div class="flex justify-between border-b border-slate-300 pb-1"><span>Bomberos:</span><span>${formatoMoneda(c.bomberos)}</span></div>
          <div class="flex justify-between border-b border-slate-300 pb-1"><span>Cooperativa:</span><span>${formatoMoneda(c.cooperativa)}</span></div>
          <div class="flex justify-between border-b border-slate-300 pb-1"><span>Transferencia:</span><span>${formatoMoneda(c.transferencia)}</span></div>
          <div class="flex justify-between"><span>Otro:</span><span>${formatoMoneda(c.otro)}</span></div>
        `;

    return `
      <div class="bg-[#f2f6f4] border-2 border-emerald-700 rounded-2xl p-6 shadow-sm space-y-6">
        <div class="flex flex-wrap justify-between items-center gap-4 border-b-2 border-slate-300/60 pb-4">
          <div>
            <span class="text-sm font-bold text-slate-600 uppercase">Comprobante #${c.id}</span>
            <h3 class="text-2xl font-black text-emerald-900">Fecha: ${c.fecha}</h3>
          </div>
          <div class="flex flex-wrap gap-3">
            <button onclick="descargarPDFPorId(${c.id})"
              class="bg-emerald-700 hover:bg-emerald-800 text-[#f2f6f4] font-black py-3 px-6 rounded-xl text-lg transition">
              DESCARGAR PDF
            </button>
            <button onclick="anularCierre(${c.id})"
              class="bg-red-700 hover:bg-red-800 text-[#f2f6f4] font-black py-3 px-5 rounded-xl text-lg transition">
              ANULAR CIERRE
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-[#e6eeea] border-2 border-emerald-700/40 rounded-xl p-4 text-center">
            <h4 class="text-xl font-black text-emerald-900">Super</h4>
            ${c.surtidor_act_super > 0 ? `<p class="text-xs font-mono font-bold text-slate-600 mt-1">Surtidor: ${c.surtidor_ant_super} → ${c.surtidor_act_super}</p>` : ''}
            <p class="text-slate-700 font-bold mt-2">L. venta: ${c.litros_super.toFixed(2)} L</p>
            <p class="text-xl font-black text-slate-900 mt-1">${formatoMoneda(c.valor_super)}</p>
          </div>
          <div class="bg-[#e6eeea] border-2 border-emerald-700/40 rounded-xl p-4 text-center">
            <h4 class="text-xl font-black text-emerald-900">Euro</h4>
            ${c.surtidor_act_euro > 0 ? `<p class="text-xs font-mono font-bold text-slate-600 mt-1">Surtidor: ${c.surtidor_ant_euro} → ${c.surtidor_act_euro}</p>` : ''}
            <p class="text-slate-700 font-bold mt-2">L. venta: ${c.litros_euro.toFixed(2)} L</p>
            <p class="text-xl font-black text-slate-900 mt-1">${formatoMoneda(c.valor_euro)}</p>
          </div>
          <div class="bg-[#e6eeea] border-2 border-emerald-700/40 rounded-xl p-4 text-center">
            <h4 class="text-xl font-black text-emerald-900">Gasoil</h4>
            ${c.surtidor_act_gasoil > 0 ? `<p class="text-xs font-mono font-bold text-slate-600 mt-1">Surtidor: ${c.surtidor_ant_gasoil} → ${c.surtidor_act_gasoil}</p>` : ''}
            <p class="text-slate-700 font-bold mt-2">L. venta: ${c.litros_gasoil.toFixed(2)} L</p>
            <p class="text-xl font-black text-slate-900 mt-1">${formatoMoneda(c.valor_gasoil)}</p>
          </div>
        </div>

        <div class="bg-emerald-800 text-[#f2f6f4] rounded-xl p-4 flex justify-between items-center">
          <span class="text-xl font-extrabold">TOTAL VENTA:</span>
          <span class="text-3xl font-black">${formatoMoneda(c.total_venta)}</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div class="space-y-2 text-lg font-bold text-slate-700">
            ${desgloseHtml}
          </div>
          <div class="bg-[#e6eeea] border-2 border-emerald-700 rounded-xl p-5 text-center">
            <span class="text-sm font-extrabold text-slate-600 uppercase">Total Normalizado</span>
            <p class="text-3xl font-black text-emerald-800 mt-1">${formatoMoneda(c.total_normalizado)}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// INFORMES MENSUALES
// ==========================================
async function cargarVistaPreviaMensual() {
  const mes = document.getElementById('mes_informe').value;
  const cont = document.getElementById('preview-mensual');
  if (!mes) return;

  const res = await fetch(`/api/informes/${mes}?t=${Date.now()}`, { cache: 'no-store' });
  const data = await res.json();
  ultimoInformeMensualCargado = data;

  if (data.cierres.length === 0) {
    cont.innerHTML = `<p class="text-center text-slate-600 font-bold text-xl py-8">No hay cierres registrados en ${mes}.</p>`;
    return;
  }

  const r = data.resumen;
  cont.innerHTML = `
    <div class="space-y-6">
      <div>
        <h3 class="text-sm font-extrabold text-slate-600 uppercase tracking-wider mb-3">Ventas por Combustible (${r.cantidad_cierres} cierres)</h3>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="bg-[#e6eeea] border-2 border-emerald-700 rounded-2xl p-4">
            <span class="text-xs font-extrabold text-emerald-900 uppercase">Super Vendido</span>
            <p class="text-2xl font-black text-slate-900">${r.litros_super.toFixed(1)} L</p>
            <p class="text-sm font-bold text-emerald-800">${formatoMoneda(r.valor_super)}</p>
          </div>
          <div class="bg-[#e6eeea] border-2 border-emerald-700 rounded-2xl p-4">
            <span class="text-xs font-extrabold text-emerald-900 uppercase">Euro Vendido</span>
            <p class="text-2xl font-black text-slate-900">${r.litros_euro.toFixed(1)} L</p>
            <p class="text-sm font-bold text-emerald-800">${formatoMoneda(r.valor_euro)}</p>
          </div>
          <div class="bg-[#e6eeea] border-2 border-emerald-700 rounded-2xl p-4">
            <span class="text-xs font-extrabold text-emerald-900 uppercase">Gasoil Vendido</span>
            <p class="text-2xl font-black text-slate-900">${r.litros_gasoil.toFixed(1)} L</p>
            <p class="text-sm font-bold text-emerald-800">${formatoMoneda(r.valor_gasoil)}</p>
          </div>
          <div class="bg-emerald-800 text-[#f2f6f4] rounded-2xl p-4">
            <span class="text-xs font-extrabold text-emerald-200 uppercase">Total Venta Combustible</span>
            <p class="text-2xl font-black mt-1">${formatoMoneda(r.total_venta)}</p>
            <p class="text-xs text-emerald-100 mt-1">Normalizado: ${formatoMoneda(r.total_normalizado)}</p>
          </div>
        </div>
      </div>

      <div>
        <h3 class="text-sm font-extrabold text-slate-600 uppercase tracking-wider mb-3">Resumen Mensual por Medio de Pago y Liquidación por Entidad</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div class="bg-[#e6eeea] border-2 border-emerald-700 rounded-2xl p-4 flex flex-col justify-between gap-3">
            <div>
              <span class="text-xs font-extrabold text-emerald-900 uppercase">Cuenta Mensual Policía</span>
              <p class="text-2xl font-black text-emerald-950 mt-1">${formatoMoneda(r.policia)}</p>
            </div>
            <button onclick="generarPDFEntidadMensual('Policía')"
              class="w-full bg-emerald-700 hover:bg-emerald-800 text-[#f2f6f4] font-black py-2.5 px-4 rounded-xl text-sm transition">
              DESCARGAR PDF POLICÍA
            </button>
          </div>

          <div class="bg-[#e6eeea] border-2 border-emerald-700 rounded-2xl p-4 flex flex-col justify-between gap-3">
            <div>
              <span class="text-xs font-extrabold text-emerald-900 uppercase">Cuenta Mensual Comuna</span>
              <p class="text-2xl font-black text-emerald-950 mt-1">${formatoMoneda(r.comuna)}</p>
            </div>
            <button onclick="generarPDFEntidadMensual('Comuna')"
              class="w-full bg-emerald-700 hover:bg-emerald-800 text-[#f2f6f4] font-black py-2.5 px-4 rounded-xl text-sm transition">
              DESCARGAR PDF COMUNA
            </button>
          </div>

          <div class="bg-[#e6eeea] border-2 border-emerald-700 rounded-2xl p-4 flex flex-col justify-between gap-3">
            <div>
              <span class="text-xs font-extrabold text-emerald-900 uppercase">Cuenta Mensual Bomberos</span>
              <p class="text-2xl font-black text-emerald-950 mt-1">${formatoMoneda(r.bomberos)}</p>
            </div>
            <button onclick="generarPDFEntidadMensual('Bomberos')"
              class="w-full bg-emerald-700 hover:bg-emerald-800 text-[#f2f6f4] font-black py-2.5 px-4 rounded-xl text-sm transition">
              DESCARGAR PDF BOMBEROS
            </button>
          </div>

          <div class="bg-[#e6eeea] border-2 border-emerald-700 rounded-2xl p-4 flex flex-col justify-between gap-3">
            <div>
              <span class="text-xs font-extrabold text-emerald-900 uppercase">Cuenta Mensual Cooperativa</span>
              <p class="text-2xl font-black text-emerald-950 mt-1">${formatoMoneda(r.cooperativa)}</p>
            </div>
            <button onclick="generarPDFEntidadMensual('Cooperativa')"
              class="w-full bg-emerald-700 hover:bg-emerald-800 text-[#f2f6f4] font-black py-2.5 px-4 rounded-xl text-sm transition">
              DESCARGAR PDF COOPERATIVA
            </button>
          </div>

          <div class="bg-[#e6eeea] border-2 border-emerald-700/40 rounded-2xl p-4">
            <span class="text-xs font-extrabold text-slate-600 uppercase">Efectivo Mensual</span>
            <p class="text-xl font-black text-slate-900 mt-1">${formatoMoneda(r.efectivo)}</p>
          </div>

          <div class="bg-[#e6eeea] border-2 border-emerald-700/40 rounded-2xl p-4">
            <span class="text-xs font-extrabold text-slate-600 uppercase">Transferencia Mensual</span>
            <p class="text-xl font-black text-slate-900 mt-1">${formatoMoneda(r.transferencia)}</p>
          </div>

          <div class="bg-[#e6eeea] border-2 border-emerald-700/40 rounded-2xl p-4 sm:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span class="text-xs font-extrabold text-slate-600 uppercase">Otros Conceptos Mensual</span>
              <p class="text-xl font-black text-slate-900 mt-1">${formatoMoneda(r.otro)}</p>
            </div>
            <button onclick="generarPDFEntidadMensual('Otro')"
              class="bg-slate-700 hover:bg-slate-800 text-[#f2f6f4] font-black py-2.5 px-5 rounded-xl text-xs transition">
              DESCARGAR DETALLE OTROS
            </button>
          </div>

        </div>
      </div>
    </div>
  `;
}

// ==========================================
// PDF INDIVIDUAL DE LIQUIDACIÓN POR ENTIDAD
// ==========================================
async function generarPDFEntidadMensual(entidad) {
  const mes = document.getElementById('mes_informe').value;
  if (!mes) return alert('Seleccione un mes.');

  const res = await fetch(`/api/informes/${mes}?t=${Date.now()}`, { cache: 'no-store' });
  const data = await res.json();

  const filasEntidad = [];
  let totalEntidad = 0;

  data.cierres.forEach(c => {
    const items = (c.medios_extra || []).filter(item => item.categoria === entidad);

    if (items.length > 0) {
      items.forEach(item => {
        totalEntidad += Number(item.monto || 0);
        let detalleStr = item.descripcion || '-';
        if (item.combustible && item.litros) {
          detalleStr = `${item.litros} L de ${item.combustible}` + (item.descripcion ? ` (${item.descripcion})` : '');
        }
        filasEntidad.push([
          c.fecha,
          `Comprobante #${c.id}`,
          item.tipo,
          detalleStr,
          formatoMoneda(item.monto)
        ]);
      });
    } else {
      const campoMapa = {
        'Policía': c.policia,
        'Comuna': c.comuna,
        'Bomberos': c.bomberos,
        'Cooperativa': c.cooperativa,
        'Otro': c.otro
      };
      const montoDirecto = Number(campoMapa[entidad] || 0);
      if (montoDirecto > 0) {
        totalEntidad += montoDirecto;
        filasEntidad.push([
          c.fecha,
          `Comprobante #${c.id}`,
          entidad,
          '-',
          formatoMoneda(montoDirecto)
        ]);
      }
    }
  });

  if (filasEntidad.length === 0) {
    return alert(`No se registraron consumos para "${entidad}" en el período ${mes}.`);
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(21, 128, 61);
  doc.text('SC Estevez', 14, 18);

  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text(`LIQUIDACIÓN MENSUAL DE CUENTA CORRIENTE: ${entidad.toUpperCase()}`, 14, 27);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(`Período liquidado: ${mes}   |   Cantidad de registros: ${filasEntidad.length}`, 14, 34);

  doc.autoTable({
    startY: 40,
    head: [['Fecha', 'N° Cierre', 'Concepto', 'Detalle (Litros / Móvil / Patente)', 'Importe ($)']],
    body: [
      ...filasEntidad,
      ['', '', '', 'TOTAL A ABONAR', formatoMoneda(totalEntidad)]
    ],
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [21, 128, 61] },
    didParseCell: function (hookData) {
      if (hookData.row.index === filasEntidad.length) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [230, 238, 234];
        hookData.cell.styles.textColor = [21, 128, 61];
      }
    }
  });

  const finalY = doc.lastAutoTable.finalY + 25;
  if (finalY < 270) {
    doc.setDrawColor(148, 163, 184);
    doc.line(30, finalY, 90, finalY);
    doc.line(120, finalY, 180, finalY);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Firma y Sello SC Estevez', 60, finalY + 5, { align: 'center' });
    doc.text(`Conformidad ${entidad}`, 150, finalY + 5, { align: 'center' });
  }

  doc.save(`Liquidacion_${entidad}_SC_Estevez_${mes}.pdf`);
}

// ==========================================
// GENERADORES DE PDF GENERALES
// ==========================================
function generarComprobantePDF(d, idCierre) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const items = d.medios_extra || [];

  const dibujarMarcoPagina = () => {
    doc.setDrawColor(21, 128, 61);
    doc.setLineWidth(0.8);
    doc.rect(15, 15, 180, 267);
  };

  dibujarMarcoPagina();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(21, 128, 61);
  doc.text('SC Estevez', 105, 27, { align: 'center' });

  doc.setFontSize(14);
  doc.setTextColor(21, 128, 61);
  doc.text(`COMPROBANTE DE CIERRE #${idCierre}`, 105, 35, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text(`Fecha: ${d.fecha}`, 105, 42, { align: 'center' });

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.4);
  doc.line(75, 48, 75, 106);
  doc.line(135, 48, 135, 106);

  doc.setFontSize(14);
  doc.text('Super', 45, 56, { align: 'center' });
  doc.text('Euro', 105, 56, { align: 'center' });
  doc.text('Gasoil', 165, 56, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (Number(d.surtidor_act_super) > 0) {
    doc.text(`Surt: ${d.surtidor_ant_super} -> ${d.surtidor_act_super}`, 45, 63, { align: 'center' });
  }
  if (Number(d.surtidor_act_euro) > 0) {
    doc.text(`Surt: ${d.surtidor_ant_euro} -> ${d.surtidor_act_euro}`, 105, 63, { align: 'center' });
  }
  if (Number(d.surtidor_act_gasoil) > 0) {
    doc.text(`Surt: ${d.surtidor_ant_gasoil} -> ${d.surtidor_act_gasoil}`, 165, 63, { align: 'center' });
  }

  doc.setFontSize(11);
  doc.text(`L. venta: ${Number(d.litros_super).toFixed(2)} L`, 45, 73, { align: 'center' });
  doc.text(`L. venta: ${Number(d.litros_euro).toFixed(2)} L`, 105, 73, { align: 'center' });
  doc.text(`L. venta: ${Number(d.litros_gasoil).toFixed(2)} L`, 165, 73, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.text(`Valor: ${formatoMoneda(Number(d.valor_super))}`, 45, 89, { align: 'center' });
  doc.text(`Valor: ${formatoMoneda(Number(d.valor_euro))}`, 105, 89, { align: 'center' });
  doc.text(`Valor: ${formatoMoneda(Number(d.valor_gasoil))}`, 165, 89, { align: 'center' });

  doc.setLineWidth(0.6);
  doc.line(25, 112, 185, 112);

  doc.setFontSize(15);
  doc.text(`Total venta: ${formatoMoneda(Number(d.total_venta))}`, 105, 123, { align: 'center' });

  doc.line(25, 130, 185, 130);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  let y = 144;

  if (items.length > 0) {
    items.forEach(item => {
      if (y > 250) {
        doc.addPage();
        dibujarMarcoPagina();
        y = 30;
      }
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(`${item.tipo} : ${formatoMoneda(Number(item.monto))}`, 30, y);
      
      let textoExtra = '';
      if (item.combustible && item.litros) {
        textoExtra += `${item.litros} L de ${item.combustible}`;
      }
      if (item.descripcion) {
        textoExtra += textoExtra ? ` - ${item.descripcion}` : item.descripcion;
      }

      if (textoExtra) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        const lineasDesc = doc.splitTextToSize(`(${textoExtra})`, 145);
        doc.text(lineasDesc, 33, y + 5);
        doc.setFontSize(12);
        y += 8 + (lineasDesc.length * 4.5);
      } else {
        y += 9;
      }
      doc.setFont('helvetica', 'normal');
    });
  } else {
    doc.text(`Efectivo : ${formatoMoneda(Number(d.efectivo))}`, 30, y); y += 8;
    doc.text(`Policía : ${formatoMoneda(Number(d.policia))}`, 30, y); y += 8;
    doc.text(`Comuna : ${formatoMoneda(Number(d.comuna || 0))}`, 30, y); y += 8;
    doc.text(`Bomberos : ${formatoMoneda(Number(d.bomberos || 0))}`, 30, y); y += 8;
    doc.text(`Cooperativa : ${formatoMoneda(Number(d.cooperativa || 0))}`, 30, y); y += 8;
    doc.text(`Transferencia : ${formatoMoneda(Number(d.transferencia))}`, 30, y); y += 8;
    doc.text(`Otro : ${formatoMoneda(Number(d.otro))}`, 30, y); y += 8;
  }

  if (y > 255) {
    doc.addPage();
    dibujarMarcoPagina();
    y = 30;
  }

  const yTotalNorm = Math.max(195, y + 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(21, 128, 61);
  doc.text('Total normalizado:', 150, yTotalNorm, { align: 'center' });
  doc.setFontSize(15);
  doc.text(formatoMoneda(Number(d.total_normalizado)), 150, yTotalNorm + 8, { align: 'center' });

  doc.save(`Cierre_Caja_${d.fecha}_N${idCierre}.pdf`);
}

async function generarInformeMensualPDF() {
  const mes = document.getElementById('mes_informe').value;
  if (!mes) return alert('Seleccione un mes.');

  const res = await fetch(`/api/informes/${mes}?t=${Date.now()}`, { cache: 'no-store' });
  const data = await res.json();

  if (data.cierres.length === 0) {
    return alert(`No hay cierres registrados para el período ${mes}.`);
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const r = data.resumen;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(21, 128, 61);
  doc.text('SC Estevez', 14, 16);

  doc.setFontSize(15);
  doc.setTextColor(21, 128, 61);
  doc.text(`INFORME MENSUAL DE VENTAS Y LITROS - PERÍODO ${mes}`, 14, 24);

  doc.setFontSize(11);
  doc.setTextColor(51, 65, 85);
  doc.text(`Total de cierres registrados: ${r.cantidad_cierres}`, 14, 31);

  // 1. Tabla resumen por combustible
  doc.autoTable({
    startY: 35,
    head: [['Combustible', 'Total Litros Vendidos', 'Recaudación Total ($)']],
    body: [
      ['Super', `${r.litros_super.toFixed(2)} L`, formatoMoneda(r.valor_super)],
      ['Euro', `${r.litros_euro.toFixed(2)} L`, formatoMoneda(r.valor_euro)],
      ['Gasoil', `${r.litros_gasoil.toFixed(2)} L`, formatoMoneda(r.valor_gasoil)],
      ['TOTAL GENERAL', `${(r.litros_super + r.litros_euro + r.litros_gasoil).toFixed(2)} L`, formatoMoneda(r.total_venta)]
    ],
    theme: 'grid',
    headStyles: { fillColor: [21, 128, 61] }
  });

  // 2. Tabla consolidado mensual por Medio de Pago / Entidad
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 7,
    head: [['Efectivo', 'Policía', 'Comuna', 'Bomberos', 'Cooperativa', 'Transferencia', 'Otro', 'Total Normalizado Mes']],
    body: [[
      formatoMoneda(r.efectivo),
      formatoMoneda(r.policia),
      formatoMoneda(r.comuna),
      formatoMoneda(r.bomberos),
      formatoMoneda(r.cooperativa),
      formatoMoneda(r.transferencia),
      formatoMoneda(r.otro),
      formatoMoneda(r.total_normalizado)
    ]],
    theme: 'grid',
    styles: { fontStyle: 'bold', fontSize: 9 },
    headStyles: { fillColor: [15, 118, 110] }
  });

  // 3. Tabla detalle diario de cierres
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 7,
    head: [['Fecha', 'Super (L)', 'Euro (L)', 'Gasoil (L)', 'Total Venta', 'Efectivo', 'Policía', 'Comuna', 'Bomberos', 'Coop.', 'Transf.', 'Otro', 'Normalizado']],
    body: data.cierres.map(c => [
      c.fecha,
      c.litros_super.toFixed(1),
      c.litros_euro.toFixed(1),
      c.litros_gasoil.toFixed(1),
      formatoMoneda(c.total_venta),
      formatoMoneda(c.efectivo),
      formatoMoneda(c.policia),
      formatoMoneda(c.comuna || 0),
      formatoMoneda(c.bomberos || 0),
      formatoMoneda(c.cooperativa || 0),
      formatoMoneda(c.transferencia),
      formatoMoneda(c.otro),
      formatoMoneda(c.total_normalizado)
    ]),
    styles: { fontSize: 7.5 },
    headStyles: { fillColor: [21, 128, 61] }
  });

  // 4. Desglose detallado de vales con litros y descripciones
  const movimientosEspeciales = [];
  data.cierres.forEach(c => {
    (c.medios_extra || []).forEach(item => {
      if (['Policía', 'Comuna', 'Bomberos', 'Cooperativa', 'Otro'].includes(item.categoria) || item.descripcion) {
        let det = item.descripcion || '-';
        if (item.combustible && item.litros) {
          det = `${item.litros} L de ${item.combustible}` + (item.descripcion ? ` (${item.descripcion})` : '');
        }
        movimientosEspeciales.push([
          c.fecha,
          `#${c.id}`,
          item.tipo,
          det,
          formatoMoneda(item.monto)
        ]);
      }
    });
  });

  if (movimientosEspeciales.length > 0) {
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Fecha', 'Cierre', 'Entidad / Concepto', 'Detalle (Litros / Móvil / Patente)', 'Monto ($)']],
      body: movimientosEspeciales,
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [51, 65, 85] }
    });
  }

  doc.save(`Informe_Mensual_SC_Estevez_${mes}.pdf`);
}