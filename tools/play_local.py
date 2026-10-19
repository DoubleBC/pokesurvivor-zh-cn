"""Serve this game on a stable local origin so browser saves survive restarts."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
PORT = 18766
URL = f'http://127.0.0.1:{PORT}/'


def main():
    try:
        server = ThreadingHTTPServer(('127.0.0.1', PORT), partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
    except OSError:
        try:
            with urllib.request.urlopen(URL, timeout=2) as response:
                if b'ps-default-lang' in response.read():
                    webbrowser.open(URL)
                    return
        except Exception:
            pass
        print(f'Port {PORT} is in use. Close its server and try again.')
        input('Press Enter to close.')
        return
    print(f'PokeSurvivor local Chinese edition: {URL}')
    print('Keep this window open while playing. Close it to stop the local server.')
    webbrowser.open(URL)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
