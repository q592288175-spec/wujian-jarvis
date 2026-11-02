// Keep existing bookmarks and desktop notifications on the same workbench.
const target=new URL('/market-panorama.html',location.origin),params=new URLSearchParams(location.search);
target.search=params.toString();
target.hash=params.has('view')?'trade/'+params.get('view'):(location.hash||localStorage.getItem('wj-unified-page')||'market/home');
location.replace(target.href);
