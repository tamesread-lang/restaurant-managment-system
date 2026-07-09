// تذكر استبدال هذه القيم ببيانات مشروعك الفعلي من Supabase
const SUPABASE_URL = "https://kamfesnnlnlmlxfvnwkv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthbWZlc25ubG5sbWx4ZnZud2t2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDY4MDcsImV4cCI6MjA5OTE4MjgwN30.gEoSKLzCPmpmjnJbremQexCT3Wi7UCFHFfIS3oXS6hI";

// تهيئة العميل الأساسي وتصديره ليتم استخدامه في جميع الـ Modules الأخرى
export const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

if (!supabase) {
    console.error("فشل تحميل مكتبة Supabase. تأكد من إدراج الـ CDN في ملف الـ HTML.");
}