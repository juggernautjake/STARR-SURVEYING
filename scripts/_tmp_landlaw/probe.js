const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});await c.connect();
const cand=['employee_contact_methods','employee_images','custom_roles','messages','notifications','lead_attachments','lead_replies','lead_notes','reply_templates','payout_batches','employee_payment_methods','payment_secret_audit'];
const ex=(await c.query(`select table_name from information_schema.tables where table_schema='public' and table_name = any($1)`,[cand])).rows.map(r=>r.table_name);
for(const t of cand) console.log(`  ${t}: ${ex.includes(t)?'PRESENT':'MISSING'}`);
await c.end();})().catch(e=>{console.error(e.message);process.exit(1)});
