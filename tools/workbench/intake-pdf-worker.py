import sys, json, io, hashlib, resource, platform

limits = json.loads(sys.argv[1])
hard_memory = True
try:
    resource.setrlimit(resource.RLIMIT_AS, (limits['memoryBytes'], limits['memoryBytes']))
except (ValueError, OSError):
    hard_memory = False
resource.setrlimit(resource.RLIMIT_CPU, (max(1, limits['cpuSeconds']), max(1, limits['cpuSeconds'])))
import pypdf
import pdfplumber

identity = dict(python=sys.executable, pythonVersion=platform.python_version(), pypdf=pypdf.__version__, pdfplumber=pdfplumber.__version__, memoryLimit=list(resource.getrlimit(resource.RLIMIT_AS)), hardAddressSpaceLimit=hard_memory, memoryEnforcement='rlimit_as_and_rss_watchdog' if hard_memory else 'rss_watchdog' )
if len(sys.argv) > 2 and sys.argv[2] == '--probe':
    print(json.dumps(identity))
    sys.exit(0)

def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def u16(text):
    return len(text.encode('utf-16-le')) // 2

result = dict(status='failed', text='', textHash=sha(''), pages=[], diagnostics=[], identity=identity, limits=limits)
try:
    data = sys.stdin.buffer.read(limits['bytes'] + 1)
    if len(data) > limits['bytes']:
        result['status'] = 'limit_exceeded'
    elif not data.startswith(b'%PDF-'):
        result['status'] = 'invalid'
    else:
        reader = pypdf.PdfReader(io.BytesIO(data), strict=True)
        if reader.is_encrypted:
            result['status'] = 'password_required'
        elif len(reader.pages) > limits['pages']:
            result['status'] = 'limit_exceeded'
        else:
            total_bytes, total_nodes, start = 0, 0, 0
            texts = []
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                for number, page in enumerate(pdf.pages, 1):
                    text = page.extract_text() or ''
                    total_bytes += len(text.encode('utf-8'))
                    if total_bytes > limits['textBytes']:
                        raise OverflowError('text_limit')
                    words = page.extract_words()
                    total_nodes += len(words)
                    if total_nodes > limits['nodes']:
                        raise OverflowError('node_limit')
                    channel = [dict(text=w['text'], x0=w['x0'], top=w['top'], x1=w['x1'], bottom=w['bottom']) for w in words]
                    result['pages'].append(dict(number=number, width=page.width, height=page.height, rotation=page.rotation, text=text, textHash=sha(text), textStartUtf16=start, textEndUtf16=start+u16(text), status='text_extracted' if text else 'no_text', wordChannel=channel))
                    texts.append(text)
                    start += u16(text) + 1
            result['text'] = '\f'.join(texts)
            result['textHash'] = sha(result['text'])
            nonempty = sum(bool(t) for t in texts)
            result['status'] = 'text_extracted' if nonempty == len(texts) and nonempty else 'partial' if nonempty else 'no_text'
except OverflowError as error:
    result.update(status='limit_exceeded', text='', textHash=sha(''), pages=[], diagnostics=[str(error)[:200]])
except MemoryError:
    result.update(status='limit_exceeded', text='', textHash=sha(''), pages=[], diagnostics=['memory_limit'])
except Exception as error:
    result.update(status='invalid', text='', textHash=sha(''), pages=[], diagnostics=[type(error).__name__[:200]])
print(json.dumps(result, ensure_ascii=True, separators=(',', ':')))
