import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html = await readFile(new URL('../docs/index.html', import.meta.url), 'utf8');
const init = html.match(/<script>(.*?)<\/script>/s)[1];
for (const [label, saved, expected] of [['new visitor',null,'light'],['manual dark','dark','dark'],['manual light','light','light'],['invalid preference','auto','light']]) {
  test(label + ': explicit preference, independent of OS dark mode', () => {
    const document = {documentElement:{dataset:{theme:'light'}}};
    vm.runInNewContext(init, {document,localStorage:{getItem:()=>saved},matchMedia:()=>{throw Error('Must not follow OS theme')}});
    assert.equal(document.documentElement.dataset.theme,expected);
  });
}
test('storage blocked still starts in light mode',()=>{
  const document = {documentElement:{dataset:{theme:'light'}}};
  vm.runInNewContext(init,{document,get localStorage(){throw Error('blocked')}});
  assert.equal(document.documentElement.dataset.theme,'light');
});
