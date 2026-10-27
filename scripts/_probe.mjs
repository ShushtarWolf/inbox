import { chromium } from 'playwright'
const [,,which]=process.argv
const b=await chromium.launch({executablePath:'/home/box/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell'}); const p=await b.newPage({viewport:{width:1440,height:900}})
if(which==='sot'){await p.goto('file://'+process.cwd()+'/design-reference/sot/inbox-all-pages.html');await p.evaluate(()=>go('home'));await p.waitForTimeout(800)}
else {await p.goto('http://localhost:3000/',{waitUntil:'networkidle'});await p.waitForTimeout(1500)}
const r=await p.evaluate(()=>{
 const root=document.querySelector('#pg-home')||document.body
 const out=[]
 const seen=new Set()
 for(const el of root.querySelectorAll('header,nav,section,button,a,h1,h2,p,input,select,img,svg,[class*=hero],[class*=search],[class*=dot]')){
  const r=el.getBoundingClientRect(); if(r.width<2||r.top>700||r.top<-5) continue
  const cs=getComputedStyle(el); const k=el.tagName+'.'+(el.className?.baseVal??el.className).toString().slice(0,40)
  out.push(`${k} | ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} | fs${cs.fontSize} fw${cs.fontWeight} c${cs.color} bg${cs.backgroundColor} br${cs.borderRadius} pad${cs.padding} | ${(el.innerText||'').slice(0,20).replace(/\n/g,' ')}`)
 }
 return out.join('\n')})
console.log(r); await b.close()
