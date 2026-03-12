const { server, port } = require("./src/appSoloTwilio");

server.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});