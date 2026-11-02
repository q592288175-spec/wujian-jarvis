// Sector colors are visual navigation only, never a long/short signal.
export const GLOBE_PALETTE=[
 {key:'finance',name:'红色',hex:'#ff5f67'},
 {key:'precious',name:'橙色',hex:'#ff9f43'},
 {key:'nonferrous',name:'黄色',hex:'#ffe066'},
 {key:'new-energy',name:'绿色',hex:'#4bd98c'},
 {key:'black',name:'青色',hex:'#42d9ee'},
 {key:'chemical',name:'蓝色',hex:'#548dff'},
 {key:'agriculture',name:'紫色',hex:'#b28aff'}
];

export const globePaletteKey=key=>({index:'finance',bond:'finance',energy:'chemical',sideline:'agriculture',other:'shipping'}[key]||key);
export function globeSelection(key,previous='all'){
 key=globePaletteKey(key);
 if(key==='shipping')return previous;
 return GLOBE_PALETTE.some(item=>item.key===key)?key:'all';
}

export function paletteColorAt(phase){
 const p=((phase%1+1)%1)*GLOBE_PALETTE.length,index=Math.floor(p),weight=p-index;
 const a=parseInt(GLOBE_PALETTE[index].hex.slice(1),16),b=parseInt(GLOBE_PALETTE[(index+1)%GLOBE_PALETTE.length].hex.slice(1),16);
 const channel=shift=>Math.round(((a>>shift)&255)*(1-weight)+((b>>shift)&255)*weight);
 return '#'+[16,8,0].map(shift=>channel(shift).toString(16).padStart(2,'0')).join('');
}

// Static indexes also work on WebGL implementations without dynamic uniform indexing.
export const paletteShader=`
uniform vec3 palette[7];
uniform float phase;
uniform float rainbow;
uniform vec3 color;
vec3 spectrum(float x){
 float p=fract(x)*7.;
 if(p<1.)return mix(palette[0],palette[1],p);
 if(p<2.)return mix(palette[1],palette[2],p-1.);
 if(p<3.)return mix(palette[2],palette[3],p-2.);
 if(p<4.)return mix(palette[3],palette[4],p-3.);
 if(p<5.)return mix(palette[4],palette[5],p-4.);
 if(p<6.)return mix(palette[5],palette[6],p-5.);
 return mix(palette[6],palette[0],p-6.);
}
vec3 globeColor(float x){return mix(color,spectrum(x+phase),rainbow);}
`;
