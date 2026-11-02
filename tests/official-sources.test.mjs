import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseList,parseRss,nbsPriceRows,OFFICIAL_SOURCES} from '../integrations/official-sources.mjs';

test('official list keeps whitelisted links, full titles and dates from URL or nearby text',()=>{
 const html=`<li><a href="./202610/t20261008_1965465.html" title="2026年9月下旬流通领域重要生产资料市场价格变动情况">2026年9月下旬流通领域重要生...</a><span>2026-10-08</span></li>
 <li><a href="./202610/t20261008_1965465.html">2026年9月下旬流通领域重要生...</a></li>
 <div class="table_item_info"><a href="./202610/a.html" title="关于调整燃料油期货交易限额的通知">关于调整燃料油期货交易限额的通知</a></div><div class="info_item_date">2026-10-09</div>
 <a href="https://other.example/x">外部链接不应收录的标题</a><a href="/">首页</a>`;
 const items=parseList(html,'https://www.stats.gov.cn/sj/zxfb/',['https://www.stats.gov.cn/sj/zxfb/']);
 assert.equal(items.length,2);
 assert.deepEqual(items[0],{title:'2026年9月下旬流通领域重要生产资料市场价格变动情况',url:'https://www.stats.gov.cn/sj/zxfb/202610/t20261008_1965465.html',published:'2026-10-08'});
 assert.equal(items[1].published,'2026-10-09');
});

test('RSS parser unwraps CDATA titles and escaped HTML summaries',()=>{
 const xml=`<rss><channel><item><title><![CDATA[Oil prices jump as tanker attacks rise]]></title><link>https://www.cnbc.com/a.html</link><pubDate>Fri, 09 Oct 2026 03:00:00 GMT</pubDate><description>&lt;p&gt;Crude &amp;amp; fuel&lt;/p&gt;</description></item>
 <item><title>No link</title></item></channel></rss>`;
 const items=parseRss(xml);
 assert.equal(items.length,1);assert.equal(items[0].title,'Oil prices jump as tanker attacks rise');assert.equal(items[0].published,'2026-10-09 11:00');assert.equal(items[0].summary,'Crude & fuel');
});

test('NBS price table returns the product row once with unit and change',()=>{
 const row='<tr><td>甲醇（优等品）</td><td>吨</td><td>3808.3</td><td>112.4</td><td>3.0</td></tr>';
 const html=`<table><tr><td>产品名称</td><td>单位</td><td>本期价格（元）</td><td>比上期价格涨跌（元）</td><td>涨跌幅（%）</td></tr>${row}<tr><td>纯苯（石油苯）</td><td>吨</td><td>9653.5</td><td>588.3</td><td>6.5</td></tr></table><table>${row}</table>`;
 assert.deepEqual(nbsPriceRows(html,['甲醇']),['甲醇（优等品）：3808.3元/吨，比上期112.4元（3.0%）']);
});

test('every official source uses HTTPS and a domestic list declares its URL whitelist',()=>{
 for(const source of OFFICIAL_SOURCES){assert.match(source.url,/^https:\/\//);if(source.kind==='list')assert.ok(source.allow?.length)}
});
