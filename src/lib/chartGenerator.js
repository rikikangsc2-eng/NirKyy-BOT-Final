import db from '#database';
import axios from 'axios';
import logger from './logger.js';
import { SUPPORTED_ASSETS } from './tradingSimulator.js';

const HTML_TO_IMG_API = 'https://nirkyy-api.hf.space/api/htmltoimg';

function generateChartHtml(data, assetName, annotations = {}) {
    const seriesData = data.map(d => ({
        x: new Date(d.timestamp * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        y: [d.open, d.high, d.low, d.close]
    }));

    const yaxisAnnotations = [];
    if (annotations.entry) {
        yaxisAnnotations.push({
            y: annotations.entry.price,
            borderColor: '#4a90e2',
            strokeDashArray: 2,
            label: {
                borderColor: '#4a90e2',
                style: { color: '#fff', background: '#4a90e2' },
                text: `${annotations.entry.type.toUpperCase()} @ ${Math.round(annotations.entry.price).toLocaleString('id-ID')}`
            }
        });
    }
    if (annotations.tp) {
        yaxisAnnotations.push({
            y: annotations.tp,
            borderColor: '#2ecc71',
            label: {
                borderColor: '#2ecc71',
                style: { color: '#fff', background: '#2ecc71' },
                text: `TP @ ${Math.round(annotations.tp).toLocaleString('id-ID')}`
            }
        });
    }
    if (annotations.sl) {
        yaxisAnnotations.push({
            y: annotations.sl,
            borderColor: '#e74c3c',
            label: {
                borderColor: '#e74c3c',
                style: { color: '#fff', background: '#e74c3c' },
                text: `SL @ ${Math.round(annotations.sl).toLocaleString('id-ID')}`
            }
        });
    }

    return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Grafik Aset</title><script src="https://cdn.jsdelivr.net/npm/apexcharts"></script><style>body { margin: 0; padding: 0; background-color: #131722; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: sans-serif; }</style></head><body><div id="chart"></div><script>document.addEventListener("DOMContentLoaded", function() { var options = { series: [{ data: ${JSON.stringify(seriesData)} }], chart: { type: 'candlestick', height: 480, width: 850, background: '#131722', animations: { enabled: false }, toolbar: { show: false } }, theme: { mode: 'dark' }, title: { text: 'Grafik Harga ${SUPPORTED_ASSETS[assetName].name} (${assetName}/IDR)', align: 'left' }, xaxis: { type: 'category', tickPlacement: 'on', labels: { rotate: -45, rotateAlways: true, hideOverlappingLabels: true, trim: true, style: { fontSize: '10px' } } }, yaxis: { tooltip: { enabled: true }, labels: { formatter: function (value) { return 'Rp ' + new Intl.NumberFormat('id-ID').format(value); } } }, tooltip: { enabled: true, x: { show: true }, y: { formatter: (val) => 'Rp ' + val.toLocaleString('id-ID') } }, plotOptions: { candlestick: { colors: { upward: '#26a69a', downward: '#ef5350' } } }, annotations: { yaxis: ${JSON.stringify(yaxisAnnotations)} } }; var chart = new ApexCharts(document.querySelector("#chart"), options); chart.render(); });</script></body></html>`;
}

export async function getChartImage(assetName, annotations = {}) {
    try {
        const selectPriceStmt = db.prepare(
            'SELECT * FROM asset_price_history WHERE asset_name = ? ORDER BY timestamp DESC LIMIT 40'
        );
        const priceData = selectPriceStmt.all(assetName).reverse();
        if (priceData.length === 0) return null;
        
        const html = generateChartHtml(priceData, assetName, annotations);
        const response = await axios.post(HTML_TO_IMG_API, { html }, { responseType: 'arraybuffer' });
        
        return {
            chartBuffer: Buffer.from(response.data, 'binary'),
            priceData
        };
    } catch (error) {
        logger.error({ err: error, asset: assetName }, 'Gagal membuat gambar grafik');
        return null;
    }
}