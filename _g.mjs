import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
const BASE='http://localhost:3050';
const secret=(process.env.AUTH_SECRET??'').replace(/^["']|["']$/g,'');
const token=await encode({token:{email:'jacobmaddux@starr-surveying.com',name:'T',sub:'t',roles:['admin']},secret,salt:'authjs.session-token',maxAge:3600});
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.addCookies([{name:'authjs.session-token',value:token,domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);
const p=await ctx.newPage();
await p.goto(`${BASE}/admin/research`,{waitUntil:'networkidle'});
const id=await p.evaluate(async()=>(await (await fetch('/api/admin/research')).json()).projects[0].id);
await p.goto(`${BASE}/admin/research/${id}`,{waitUntil:'networkidle'});
await p.waitForTimeout(1800);
const cb = p.locator(".research-upload__doc-check input[type='checkbox']").first();
console.log('checkbox count:', await p.locator(".research-upload__doc-check input[type='checkbox']").count());
if (await cb.count()) {
  console.log(await cb.evaluate(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return JSON.stringify({ type: el.type, borderRadius: cs.borderRadius, appearance: cs.appearance, w: Math.round(r.width), h: Math.round(r.height) });
  }));
  await cb.scrollIntoViewIfNeeded();
  await p.locator('.research-upload__doc').first().screenshot({path:'_g.png'});
}
await b.close();
