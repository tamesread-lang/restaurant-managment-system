import { supabase } from './config.js';

export async function loadTablesAdmin() {
    const { data: tables, error } = await supabase.from('restaurant_tables').select('*').order('table_number', { ascending: true });
    if (error) return;

    const grid = document.getElementById('tables-grid');
    grid.innerHTML = '';

    tables.forEach(table => {
        const card = document.createElement('div');
        card.className = 'table-card';
        card.innerHTML = `
            <h3>طاولة رقم ${table.table_number}</h3>
            <div id="qr-${table.table_number}" class="qr-container"></div>
            <div style="display:flex; gap:5px; justify-content:center; margin-top:10px;">
                <button class="btn btn-primary btn-sm btn-download-qr" data-table="${table.table_number}">⬇️ تحميل PNG</button>
                <button class="btn btn-danger btn-sm btn-delete-table" data-id="${table.id}">حذف</button>
            </div>
        `;
        grid.appendChild(card);

        // إنشاء QR Code عالي الدقة (300×300) مع خلفية بيضاء صافية ووحدات سوداء وهوامش
        const customerUrl = `${window.location.origin}/customer.html?table=${table.table_number}`;
        const qrContainer = document.getElementById(`qr-${table.table_number}`);

        new QRCode(qrContainer, {
            text: customerUrl,
            width: 300,
            height: 300,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
    });

    bindTableEvents();
}

function bindTableEvents() {
    // حذف طاولة
    document.querySelectorAll('.btn-delete-table').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if(!confirm("هل تريد إزالة هذه الطاولة نهائياً؟")) return;
            const id = e.target.dataset.id;
            await supabase.from('restaurant_tables').delete().eq('id', id);
            loadTablesAdmin();
        });
    });

    // تحميل الـ QR كصورة PNG عالية الدقة مع هوامش بيضاء ومنطقة هدوء
    document.querySelectorAll('.btn-download-qr').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tableNum = e.target.dataset.table;
            downloadHighResQR(tableNum);
        });
    });
}

/**
 * إنشاء PNG عالي الدقة (720×720) للـ QR مع خلفية بيضاء كاملة ومنطقة هدوء خارجية
 */
function downloadHighResQR(tableNum) {
    const container = document.getElementById(`qr-${tableNum}`);
    if (!container) return;

    // canvas الأصلي الذي أنشأته مكتبة QRCode
    const sourceCanvas = container.querySelector('canvas');
    if (!sourceCanvas) {
        alert("يرجى الانتظار لحين اكتمال رندرة الـ QR بنجاح.");
        return;
    }

    const qrDisplaySize = sourceCanvas.width; // 300px
    const scale = 2;                           // رفع الدقة إلى الضعف
    const quietZone = 60;                      // هامش منطقة الهدوء (بالبكسل في الصورة النهائية)

    const qrOutputSize = qrDisplaySize * scale;          // 600px
    const totalSize = qrOutputSize + quietZone * 2;      // 720px

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = totalSize;
    outputCanvas.height = totalSize;
    const ctx = outputCanvas.getContext('2d');

    // 1. تعبئة الخلفية بالكامل باللون الأبيض
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalSize, totalSize);

    // 2. رسم QR Code في المنتصف مع الـ Scale العالي
    const offset = quietZone;
    ctx.imageSmoothingEnabled = false; // محافظة على الحواف القطعية الحادة
    ctx.drawImage(sourceCanvas, offset, offset, qrOutputSize, qrOutputSize);

    // 3. تنزيل الصورة
    const link = document.createElement('a');
    link.href = outputCanvas.toDataURL('image/png');
    link.download = `table-${tableNum}-qr.png`;
    link.click();
}