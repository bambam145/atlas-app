# Servidor local de desarrollo para atlas (sin caché, para ver cambios al instante).
# Uso:  python serve.py   →  http://localhost:5173
import http.server
import socketserver

PORT = 5173


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".webmanifest": "application/manifest+json",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


# Con hilos: una conexión colgada del navegador no bloquea las demás.
socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer.daemon_threads = True
with socketserver.ThreadingTCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"atlas corriendo en http://localhost:{PORT}")
    httpd.serve_forever()
