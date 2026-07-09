/**
 * دالة لتنظيف المدخلات النصية ومنع هجمات حقن الأكواد (XSS Prevention)
 * @param {string} str 
 * @returns {string}
 */
export function sanitizeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(match) {
        const entities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;'
        };
        return entities[match];
    });
}

/**
 * دالة للتحقق من صحة الأسعار والأرقام والتأكد من أنها قيم موجبة ومنطقية
 * @param {any} value 
 * @returns {boolean}
 */
export function isValidPrice(value) {
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0;
}

/**
 * دالة لتنسيق العملات النقدية بشكل أنيق وموحد
 * @param {number} amount 
 * @returns {string}
 */
export function formatCurrency(amount) {
    return new Intl.NumberFormat('ar-DZ', { style: 'currency', currency: 'DZD' }).format(amount);
}

/**
 * دالة لتنسيق الوقت والتاريخ المعاد من قاعدة البيانات
 * @param {string} timestamp 
 * @returns {string}
 */
export function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

/**
 * دالة لإدارة السمات المرئية (الوضع الليلي والنهاري) وحفظها في الـ LocalStorage
 */
export function initTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
}

export function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}