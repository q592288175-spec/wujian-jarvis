import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLOBE_PALETTE,globeSelection,paletteColorAt,paletteShader} from '../dist/globe-palette.js';
import {sectorGroups} from '../dist/sectors.js';

test('七个板块固定七色，航运不新增颜色或改变原板块分类',()=>{
 assert.equal(GLOBE_PALETTE.length,7);
 assert.equal(new Set(GLOBE_PALETTE.map(item=>item.hex)).size,7);
 assert.deepEqual(GLOBE_PALETTE.map(item=>item.key),sectorGroups.filter(item=>item.key!=='shipping').map(item=>item.key));
 assert.deepEqual(GLOBE_PALETTE.map(item=>item.name),['红色','橙色','黄色','绿色','青色','蓝色','紫色']);
 for(const item of GLOBE_PALETTE)assert.equal(globeSelection(item.key),item.key);
});

test('全部显示七彩，航运保留上一种模式，包括连续点击和首次默认',()=>{
 assert.equal(globeSelection('all','chemical'),'all');
 for(const previous of ['all',...GLOBE_PALETTE.map(item=>item.key)])assert.equal(globeSelection('shipping',previous),previous);
 assert.equal(globeSelection('shipping'),'all');
 assert.equal(globeSelection('unknown','chemical'),'all');
});

test('七彩插值连续闭环，各主色都能出现，负相位也安全',()=>{
 GLOBE_PALETTE.forEach((item,index)=>assert.equal(paletteColorAt(index/7),item.hex));
 assert.equal(paletteColorAt(0),paletteColorAt(1));
 assert.equal(paletteColorAt(-.125),paletteColorAt(.875));
 assert.notEqual(paletteColorAt(.1),paletteColorAt(0));
 const near=paletteColorAt(1-.000001);
 assert.equal(near,GLOBE_PALETTE[0].hex);
 assert.match(paletteShader,/palette\[7\]/);
 for(let i=0;i<7;i++)assert.ok(paletteShader.includes(`palette[${i}]`));
});

test('全息地球读取板块选择，球面和环共用渐变，减少动画仍保留七彩',()=>{
 const source=readFileSync('dist/hologram.js','utf8'),workbench=readFileSync('dist/cockpit-workbench.js','utf8');
 assert.match(workbench,/\$\('#globeScene'\)\.dataset\.selectedSector=state\.sector/);
 assert.ok(!workbench.includes("$('#globeScene').dataset.sector="),'球面状态不能混入按钮选择器');
 assert.match(source,/globeSelection\(key,selection\)/);
 assert.match(source,/rainbow:\{value:small\?0:1\}/);
 assert.match(source,/if\(!reduced\(\)\)\{t\+=dt/);
 assert.match(source,/if\(small\)\{uniforms\.color\.value\.lerp/);
 assert.match(source,/uniforms\.phase\.value=t\/56/);
 assert.match(source,/tintMaterial\(i===1\?\.85:\.4\)/);
});
