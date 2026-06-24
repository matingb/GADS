import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ResumenEmpleado {
  empleadoId: number;
  legajo: string;
  nombre: string;
  diasTrabajados: number;
  tardanzasMin: number;
  horasExtra50Min: number;
  horasExtra100Min: number;
  salidaAnticipadaMin: number;
  ausencias: number;
  novedadesAprobadas: {
    codigo?: string;
    descripcion?: string;
    fechaInicio: string;
    fechaFin: string;
    estado: string;
    observacion?: string;
  }[];
}

const minutosAHoras = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

export function descargarArchivo(nombre: string, content: Blob | string, mime: string) {
  const blob = typeof content === 'string' ? new Blob([content], { type: `${mime};charset=utf-8;` }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function resumenACsv(periodo: string, resumen: ResumenEmpleado[]): string {
  const encabezado = [
    'Legajo',
    'Nombre',
    'Dias trabajados',
    'Ausencias',
    'Tardanzas (min)',
    'Horas extra 50% (min)',
    'Horas extra 100% (min)',
    'Salida anticipada (min)',
    'Novedades aprobadas'
  ];

  const filas = resumen.map(r => {
    const novedades = r.novedadesAprobadas
      .map(n => `${n.codigo ?? ''} ${n.fechaInicio}${n.fechaFin && n.fechaFin !== n.fechaInicio ? '..' + n.fechaFin : ''}`)
      .join(' | ');
    return [
      r.legajo,
      r.nombre,
      r.diasTrabajados,
      r.ausencias,
      r.tardanzasMin,
      r.horasExtra50Min,
      r.horasExtra100Min,
      r.salidaAnticipadaMin,
      novedades
    ];
  });

  const escaparCampo = (v: unknown) => {
    const s = String(v ?? '');
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lineas = [
    `# Preliquidación período ${periodo}`,
    encabezado.join(','),
    ...filas.map(fila => fila.map(escaparCampo).join(','))
  ];
  return lineas.join('\n');
}

export function resumenAPdf(periodo: string, resumen: ResumenEmpleado[]): Blob {
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(16);
  doc.text('Resumen de Preliquidación', 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(80);
  doc.text(`Período: ${periodo}`, 14, 26);
  doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 14, 32);

  autoTable(doc, {
    startY: 40,
    head: [[
      'Legajo',
      'Nombre',
      'Días trab.',
      'Ausencias',
      'Tardanzas',
      'Hs extra 50%',
      'Hs extra 100%',
      'Salida antic.',
      'Novedades'
    ]],
    body: resumen.map(r => [
      r.legajo,
      r.nombre,
      r.diasTrabajados,
      r.ausencias,
      minutosAHoras(r.tardanzasMin),
      minutosAHoras(r.horasExtra50Min),
      minutosAHoras(r.horasExtra100Min),
      minutosAHoras(r.salidaAnticipadaMin),
      r.novedadesAprobadas
        .map(n => `${n.codigo ?? ''} (${n.fechaInicio}${n.fechaFin !== n.fechaInicio ? '..' + n.fechaFin : ''})`)
        .join('\n') || '—'
    ]),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 8: { cellWidth: 60 } }
  });

  return doc.output('blob');
}
