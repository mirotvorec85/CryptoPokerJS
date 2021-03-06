/**
* @file WebSocket Session initiation API endpoint.
*
* @example
* Client Request -> {"jsonrpc":"2.0","method":"WSS_Handshake","id":"1","params":{"user_token":"7060939278321507"}}
* Server Response -> {"jsonrpc":"2.0","result":{"message":"accept","numconnections":1,"maxconnections":3,"peerconnections":1,"server_token":"9789091435706088"},"id":"1"}
*
*/
async function WSS_Handshake (sessionObj) {
   if ((sessionObj.endpoint.startsWith("http") == false)  && (rpc_options.http_only_handshake)) {
      sendError(JSONRPC_ERRORS.WRONG_TRANSPORT, "Session handshake must be made through HTTP / HTTPS service.", sessionObj);
      return (false);
   }
   if ((namespace.websocket["connections"] == undefined) || (namespace.websocket["connections"] == null)) {
      namespace.websocket.connections = new Object();
   }
   var requestData = sessionObj.requestObj;
   var requestParams = requestData.params;
   var responseObj = new Object();
   var connectionID = namespace.websocket.makeConnectionID(sessionObj);
   var num_activeconnections = 0; //number of currently active WebSocket connections namespace.websocketly
   for (var item in namespace.websocket.connections) {
      if ((namespace.websocket.connections[item] != undefined) && (namespace.websocket.connections[item] != null)) {
         //we also need to ook at multiple connections from the same IP (if allowed)...
         for (var count = 0; count < namespace.websocket.connections[item].length; count++) {
            var websocketObj = namespace.websocket.connections[item][count];
            if (websocketObj.user_token == requestParams.user_token) {
               //when the IP is the same then the user token can't be!
               sendError(JSONRPC_ERRORS.SESSION_CLOSE, "User token already exists for your IP.", sessionObj);
               return;
            }
            num_activeconnections++;
         }
      }
   }
   var server_token = String(Math.random()).split("0.").join(""); //unique, per-connection (per-socket) server token
   if ((namespace.websocket.connections[connectionID] == undefined) || (namespace.websocket.connections[connectionID] == null)) {
      var connectionObj = new Object();
      connectionObj.user_token = requestParams.user_token;
      connectionObj.socket = null; //not yet connected
      connectionObj.last_update = new Date();
      connectionObj.server_token = server_token;
      namespace.websocket.connections[connectionID] = new Array();
      namespace.websocket.connections[connectionID].push(connectionObj);
      num_activeconnections++; //new connection just added
      responseObj.message = "accept";
      responseObj.numconnections = 1;
      responseObj.maxconnections = rpc_options.max_ws_per_ip;
      responseObj.peerconnections = num_activeconnections;
      responseObj.server_token = server_token;
      sendResult(responseObj, sessionObj);
   } else {
      let num_activeconnections = namespace.websocket.connections[connectionID].length;
      if (num_activeconnections >= rpc_options.max_ws_per_ip) {
         var infoObj = new Object();
         infoObj.numconnections = num_activeconnections;
         infoObj.maxconnections = rpc_options.max_ws_per_ip;
         responseObj.peerconnections = num_activeconnections;
         sendError(JSONRPC_ERRORS.SESSION_CLOSE, "Too many connections from your IP.", sessionObj, infoObj);
      } else {
         connectionObj = new Object();
         connectionObj.user_token = requestParams.user_token;
         connectionObj.socket = null; //not yet connected
         connectionObj.last_update = Date.now();
         connectionObj.server_token = server_token;
         namespace.websocket.connections[connectionID].push(connectionObj);
         responseObj.message = "accept";
         num_activeconnections++; //new connection just added
         responseObj.numconnections = num_activeconnections;
         responseObj.maxconnections = rpc_options.max_ws_per_ip;
         responseObj.peerconnections = num_activeconnections;
         responseObj.server_token = server_token;
         sendResult(responseObj, sessionObj);
      }
   }
   return (true);
}

/**
* Returns a connection identifier based on information provided via an active WebSocket
* within a session object.
*
* @param {Object} sessionObj A session object such as that generated by a WSS JSON-RPC 2.0
* server.
* @return {String} A connection identifier based on the remote (client) endpoint's
* protocol family (IPv4 or IPv6), and IP. The port is omitted since it may change.
*/
function makeConnectionID (sessionObj) {
   if ((sessionObj.serverRequest["socket"] != null) && (sessionObj.serverRequest["socket"] != undefined)) {
      var socket = sessionObj.serverRequest.socket; //http core socket reference
   } else {
      socket = sessionObj.serverRequest._socket; //WebSocket core socket reference
   }
   var requestIP = socket.remoteAddress;
   var IPFamily = socket.remoteFamily;
   //var requestPort = socket.remotePort; //not currently used
   var connectionID = IPFamily + ":" + requestIP;
   return (connectionID);
}

/**
* Creates a private session identifier from given server and user tokens.
*
* @param {String} server_token The (ideally) randomly generated per-connection /
* per-WebSocket ID generated by the server for the associated user.
* @param {String} user_token The (ideally) randomly generated token generated
* by the user / client.
* @return {String} The SHA256 hash of the server token concatenated with a semi-colon
* and the user token: <code>SHA256(server_token + ":" + user_token)</code>. <code>null</code>
* is returned if either of the input parameters is invalid.
*/
function makePrivateID (server_token, user_token) {
   if (typeof(server_token) != "string") {
      return (null);
   }
   if (typeof(user_token) != "string") {
      return (null);
   }
   if (server_token.length == 0) {
      return (null);
   }
   if (user_token.length == 0) {
      return (null);
   }
   let hash = crypto.createHash('sha256');
   hash.update(server_token + ":" +user_token);
   var hexOutput = hash.digest('hex');
   return (hexOutput);
}

/**
* Verifies whether a handshake for a specific session has been successfully established.
*
* @param {Object} sessionObj The session object associated with the incoming request.
* @return {Boolean} True if the session specified by the parameter has been successfully
* established, false if the information doesn't match a live internal session record.
*/
function handshakeOK(sessionObj) {
   var connectionID = namespace.websocket.makeConnectionID(sessionObj);
   if ((namespace.websocket.connections[connectionID] == null) || (namespace.websocket.connections[connectionID] == undefined)) {
      return (false)
   }
   if (namespace.websocket.connections[connectionID].length == 0) {
      return (false);
   }
   for (var count = 0; count < namespace.websocket.connections[connectionID].length; count++) {
      var connectionObj = namespace.websocket.connections[connectionID][count];
      if (connectionObj.user_token == sessionObj.requestObj.params.user_token) {
         if (connectionObj.server_token == sessionObj.requestObj.params.server_token) {
            return (true);
         } else {
            return (false);
         }
      }
   }
   return (false);
}

/**
* Returns an array of all currently registered and (optionally) active sesssions
* being handled by the server.
*
* @param {Boolean} [activeOnly=true] If true, only live or active sessions (i.e.
* those that have successfully established a handshake and connected), are returned,
* otherwise all registered (but not necessarily connected), sessions are returned.
* @return {Array} A list of all registered and (optionally) active sessions currently
* being handled by the server.
*/
function allSessions(activeOnly = true) {
   var returnArr = new Array();
   for (var cid in namespace.websocket.connections) {
      for (var count = 0; count < namespace.websocket.connections[cid].length; count++) {
         var connectionObj = namespace.websocket.connections[cid][count];
         if (activeOnly) {
            if (connectionObj.socket != null) {
               returnArr.push(connectionObj);
            }
         } else {
            returnArr.push(connectionObj);
         }
      }
   }
   return (returnArr);
}

if (namespace.websocket == undefined) {
   namespace.websocket = new Object();
}
namespace.websocket.makeConnectionID = makeConnectionID;
namespace.websocket.makePrivateID = makePrivateID;
namespace.websocket.handshakeOK = handshakeOK;
namespace.websocket.allSessions = allSessions;
