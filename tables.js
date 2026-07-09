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

        // إنشاء الـ QR Code تلقائياً داخل الحاوية المنشأة لتوجه لصفحة الزبون الفردية
        // تم استخدام الاستضافة الديناميكية النسبية لمعرفة المسار الحالي أوتوماتيكياً
        const customerUrl = `${window.location.origin}/customer.html?table=${table.table_number}`;
        new QRCode(document.getElementById(`qr-${table.table_number}`), {
            text: customerUrl,
            width: 128,
            height: 128
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

    // تحميل الـ QR كصورة PNG قابلة للطباعة واللصق على الطاولة الفيزيائية للمطعم
    document.querySelectorAll('.btn-download-qr').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tableNum = e.target.dataset.table;
            const qrImg = document.querySelector(`#qr-${tableNum} img`);
            if (qrImg) {
                const link = document.createElement('a');
                link.href = qrImg.src;
                link.download = `table-${tableNum}-qr.png`;
                link.click();
            } else {
                alert("يرجى الانتظار لحين اكتمال رندرة الـ QR بنجاح.");
            }
        });
    });
}