// Archive metadata is a projection of the saved task card; the Brief stays intact.
export function archiveEntry(p) {
  const card = p.artifacts.findLast(x => x.stage === 'brief' && x.text)?.text || '';
  const fields = new Map();
  for (const line of card.split('\n')) {
    const row = line.replace(/\*\*/g, '').trim();
    const m = row.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/) ||
      row.match(/^(?:[-•]\s*)?([^：:]{2,12})[：:]\s*(.+)$/);
    if (m && !/未提供|未明确|待核实|未知|未命名/.test(m[2])) fields.set(m[1], m[2]);
  }
  const field = (...names) => names.map(k => fields.get(k)).find(Boolean) || '';
  const heading = card.match(/^#\s+任务卡[｜|：:]\s*(.+)$/m)?.[1];
  return { id:p.id, name:field('项目名称','项目名') || heading || p.title,
    client:field('客户','客户名称'), brand:field('品牌','品牌名称','品牌或产品','品牌与产品'),
    industry:field('行业','所属行业','品类','产品品类'), date:p.updatedAt };
}

export async function libraryRequest({db, req, res, parts, send, body, filename, check, randomUUID}) {
  db.exec('CREATE TABLE IF NOT EXISTS library_files(id TEXT PRIMARY KEY,name TEXT NOT NULL, bytes BLOB NOT NULL)');
  if (parts.length === 2 && req.method === 'GET') {
    const projects = db.prepare('SELECT state FROM projects ORDER BY json_extract(state,\'$.updatedAt\') DESC').all()
      .map(row => {
        const project=JSON.parse(row.state);
        const card=project.artifacts.findLast(a=>a.stage==='brief' && (a.text || a.textHash));
        if (card?.textHash) card.text=db.prepare('SELECT text FROM artifact_texts WHERE hash=?').get(card.textHash)?.text;
        return archiveEntry(project);
      });
    const files = db.prepare('SELECT id,name FROM library_files ORDER BY rowid DESC').all()
      .map(f => ({ name:f.name, url:'/api/library/' + f.id }));
    return send(200,{projects,files});
  }
  if (parts.length === 2 && req.method === 'POST') {
    const input = await body(req);
    const name = filename(input.name);
    check(typeof input.data === 'string' && input.data.length <= 16*1024*1024, '单个资料最多 12 MB');
    const bytes = Buffer.from(input.data,'base64');
    check(bytes.length && bytes.toString('base64') === input.data,'文件内容为空或无效');
    const id = randomUUID();
    db.prepare('INSERT INTO library_files VALUES(?,?,?)').run(id,name,bytes);
    return send(201,{name,url:'/api/library/'+id});
  }
  check(parts.length === 3 && req.method === 'GET','接口不存在',404);
  const file = db.prepare('SELECT name,bytes FROM library_files WHERE id=?').get(parts[2]);
  check(file,'文件不存在',404);
  res.writeHead(200,{'Content-Type':'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store',
    'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name)});
  res.end(file.bytes);
}
