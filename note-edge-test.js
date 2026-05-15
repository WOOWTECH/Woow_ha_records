async (page) => {
  const result = await page.evaluate(async () => {
    const h = document.querySelector('home-assistant').hass;
    const c = (s, d) => h.callWS({type:'call_service', domain:'ha_note_record', service:s, service_data:d||{}, return_response:true});
    const R = [];
    const ok = (t, v) => R.push(t + ': ' + (v ? 'PASS' : 'FAIL'));
    const err = async (t, fn) => { try { await fn(); ok(t, false); } catch(e) { ok(t, true); } };

    const cat = await c('create_category', {name: 'BT Edge'});
    const cid = cat.response.category.id;
    ok('1_create_cat', cat.response.success);

    await err('2_empty_cat', () => c('create_category', {name: ''}));
    await err('3_ws_cat', () => c('create_category', {name: '   '}));
    await err('4_dup_cat', () => c('create_category', {name: 'BT Edge'}));
    await err('5_dup_cat_ci', () => c('create_category', {name: 'bt edge'}));
    await err('6_empty_title', () => c('create_note', {category_id: cid, title: ''}));
    await err('7_ws_title', () => c('create_note', {category_id: cid, title: '   '}));
    await err('8_bad_cat_id', () => c('create_note', {category_id: '00000000-0000-0000-0000-000000000000', title: 'x'}));
    await err('9_bad_note_get', () => c('get_note', {note_id: '00000000-0000-0000-0000-000000000000'}));
    await err('10_bad_note_upd', () => c('update_note', {note_id: '00000000-0000-0000-0000-000000000000', title: 'x'}));
    await err('11_bad_note_del', () => c('delete_note', {note_id: '00000000-0000-0000-0000-000000000000'}));

    const n1 = await c('create_note', {category_id: cid, title: 'BT Dup'});
    await err('12_dup_title', () => c('create_note', {category_id: cid, title: 'BT Dup'}));
    await err('13_dup_title_ci', () => c('create_note', {category_id: cid, title: 'bt dup'}));

    const maxCat = await c('create_category', {name: 'Z'.repeat(100)});
    ok('14_cat_100', maxCat.response.success && maxCat.response.category.name.length === 100);
    await c('delete_category', {category_id: maxCat.response.category.id});
    await err('15_cat_101', () => c('create_category', {name: 'Z'.repeat(101)}));

    const maxN = await c('create_note', {category_id: cid, title: 'Y'.repeat(200)});
    ok('16_note_200', maxN.response.success && maxN.response.note.title.length === 200);
    await c('delete_note', {note_id: maxN.response.note.id});
    await err('17_note_201', () => c('create_note', {category_id: cid, title: 'Y'.repeat(201)}));

    await err('18_content_over', () => c('create_note', {category_id: cid, title: 'BT Over', content: 'C'.repeat(100001)}));

    const u = await c('create_note', {category_id: cid, title: 'BT Unicode🎉', content: '中文한국어'});
    ok('19_unicode', u.response.note.title === 'BT Unicode🎉' && u.response.note.content === '中文한국어');
    await c('delete_note', {note_id: u.response.note.id});

    const xss = await c('create_note', {category_id: cid, title: 'BT XSS', content: '<script>alert(1)</script>'});
    ok('20_xss_safe', xss.response.note.content.includes('<script>'));
    await c('delete_note', {note_id: xss.response.note.id});

    // Cleanup
    await c('delete_category', {category_id: cid});
    return R.join('\n');
  });
  console.log(result);
};
