var fs = require('fs');
var ping = require('ping').promise;
var debug = require('debug')('uniqueweb:serverstatus');
var getServerInfo = require('teeworlds-server-status').getServerInfo;
var twFlags = null;

function loadTWFlags () {
  twFlags = {};
  var lastLine;
  var lines = fs.readFileSync('twflags.txt', 'utf8').split('\n');
  for (var i in lines) {
    var line = lines[i];
    var numMatch = line.match(/^== (\d+)/);
    if (numMatch) {
      var nameMatch = lastLine.match(/[A-Z]+/);
      if (nameMatch) {
        twFlags[numMatch[1]] = nameMatch[0];
      }
    }
    lastLine = line;
  }
}

class ServerStatus {
  constructor (jsonPath) {
    this.path = jsonPath;
    this.list = [];
  }

  startUpdating () {
    loadTWFlags();
    // Call also when starting
    this.updateStatus();
    // Then every x seconds
    setInterval(() => {
      this.updateStatus();
      debug('Typeof list: ');
      debug(typeof this.list);
    }, parseFloat(process.env.SERVER_STATUS_UPDATE || 5) * 1000);
  }

  updateStatus () {
    fs.readFile(this.path, 'utf8', async (err, data) => {
      if (err) debug(err);
      debug('Serverstatus.js L43 data: ');
      debug(data);
      let svlist = JSON.parse(data);
      debug('Parsed: ');
      debug(svlist);

      for (var i in svlist) {
        let server = svlist[i];

        let res = await ping.probe(server.ip, {timeout: 2});

        server.alive = res.alive;
        server.ping = res.avg;

        if (server.alive) {
          await this.getServerstatus(server);
        }
      }

      this.list = svlist;
      debug('List content: ');
      debug(this.list);
    });
  }

  getServerstatus (server) {
    let promises = [];
    for (var i in server.servers) {
      let gameServer = server.servers[i];
      promises.push(new Promise(function (resolve, reject) {
        getServerInfo(server.ip, parseInt(gameServer.port), (svInfo) => {
          gameServer.reachable = true;
          gameServer.map = svInfo.map;
          gameServer.maxclients = svInfo.maxClientCount;
          gameServer.players = svInfo.clients
            .filter(p => p.name !== '(connecting)')
            .sort((a, b) => a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1);
          gameServer.password = svInfo.password;

          for (var ply in gameServer.players) {
            if (gameServer.players[ply].country in twFlags) {
              gameServer.players[ply].flag = twFlags[gameServer.players[ply].country];
            } else {
              gameServer.players[ply].flag = 'default';
            }
          }
          resolve();
        });
      }));
    }
    return Promise.all(promises);
  }
}

module.exports = exports = ServerStatus;
