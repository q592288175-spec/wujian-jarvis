import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {themedCss} from './helpers/theme-css.mjs';

const palette=[
 ['long','strong','rgb(198, 47, 36)'],
 ['long','medium','rgb(243, 154, 148)'],
 ['long','weak','rgb(253, 236, 234)'],
 ['short','strong','rgb(40, 108, 80)'],
 ['short','medium','rgb(131, 195, 165)'],
 ['short','weak','rgb(230, 244, 238)']
];
const css=themedCss(['dist/workbench.css']);
function samples(){
 const dom=new JSDOM(`<style>${css}</style><body data-shell="stable">${palette.map(([side,tone])=>`<div class="fire-overview-group fire-${side}"><button class="fire-strength-${tone}" data-strength="${tone}"><span>品种</span><small>CU</small></button></div>`).join('')}</body>`);
 return {dom,buttons:[...dom.window.document.querySelectorAll('button')]};
}
const luminance=rgb=>{
 const v=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
 return .2126*v[0]+.7152*v[1]+.0722*v[2];
};

test('浅色工作台使用统一红绿变量，强中弱三档保持独立可识别',()=>{
 const {dom,buttons}=samples();
 assert.deepEqual(buttons.map(b=>dom.window.getComputedStyle(b).backgroundColor),palette.map(p=>p[2]));
 dom.window.close();
});

function hsl(rgb){
 const [r,g,b]=rgb.match(/[\d.]+/g).slice(0,3).map(n=>Number(n)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,lightness=(max+min)/2;
 const raw=max===r?(g-b)/delta:max===g?(b-r)/delta+2:(r-g)/delta+4;
 return {hue:(raw*60+360)%360,saturation:delta/(1-Math.abs(2*lightness-1)),lightness};
}

test('浅色红绿各自同色系，明度由强至弱依次拉开',()=>{
 const {dom,buttons}=samples();
 for(const group of [buttons.slice(0,3),buttons.slice(3)]){
  const tones=group.map(button=>hsl(dom.window.getComputedStyle(button).backgroundColor));
  assert.ok(Math.max(...tones.map(t=>t.hue))-Math.min(...tones.map(t=>t.hue))<8);
  assert.ok(tones[1].lightness-tones[0].lightness>.1);
  assert.ok(tones[2].lightness-tones[1].lightness>.1);
 }
 dom.window.close();
});

test('六档名称和代码保持清晰文字对比度，不用透明度降低可读性',()=>{
 const {dom,buttons}=samples();
 for(const button of buttons){
  const style=dom.window.getComputedStyle(button),light=luminance(style.backgroundColor),ink=luminance(style.color);
  assert.ok((Math.max(light,ink)+.05)/(Math.min(light,ink)+.05)>=4.5,button.className);
  assert.equal(dom.window.getComputedStyle(button.querySelector('small')).opacity,'1');
 }
 dom.window.close();
});
