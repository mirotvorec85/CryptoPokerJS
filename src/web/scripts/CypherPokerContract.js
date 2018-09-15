/**
* @file A virtual smart contract implementation using a WebSocket Session
* service as a TTP host.
*
* @version 0.0.1
* @author Patrick Bay
* @copyright MIT License
*/

/**
* @class A virtual smart contract interface for an associated {@link CypherPokerGame}
* instance. Communicates with a WebSocket Session TTP service instead of directly
* with a smart contract front-end.
*
* @extends EventDispatcher
*/
class CypherPokerContract extends EventDispatcher {

   /**
   * Creates a new game instance.
   *
   * @param {CypherPokerGame} gameRef The active game instance with which
   * this contract interface is associated.
   */
   constructor(gameRef) {
      super();
      this._game = gameRef;
      this.addGameEventListeners();
   }

   /**
   * @property {CypherPokerGame} game Reference to the associated game for
   * which to act as contract handler.
   */
   get game() {
      return (this._game);
   }

   /**
   * @property {CypherPoker} cypherpoker A reference to the
   * {@link CypherPokerContract#game}'s <code>cypherpoker</code> instance or
   * <code>null</code> if none exists.
   */
   get cypherpoker() {
      if ((this._game != null) && (this._game != undefined)) {
         return (this._game.cypherpoker);
      }
      return (null);
   }

   /**
   * Adds event listeners required by the contract handler to the associated
   * {@link CypherPokerContract#game} instance.
   *
   * @private
   */
   addGameEventListeners() {
      this.game.addEventListener("gamedeck", this.onNewGameDeck, this);
   }

   /**
   * Removes event listeners required by the contract handler from the associated
   * {@link CypherPokerContract#game} instance.
   *
   */
   removeGameEventListeners() {
      this.game.removeEventListener("gamedeck", this.onNewGameDeck);
   }

   /**
   * Event handler invoked a new game deck is fully generated. This triggers
   * the asynchronous creation and / or initialization of a new contract for
   * the game.
   *
   * @param {CypherPokerGame#event:gamedeck} event A "gamedeck" event.
   */
   onNewGameDeck(event) {
      if (this.game.getDealer().privateID == this.game.ownPID) {
         //dealer creates the new contract; other players only agree to it
         var paramsObj = new Object();
         //is there a better way to create the contract ID?
         paramsObj.contractID = String(Math.random()).split(".")[1];
         //TODO: sanitize keys!!!! (these should not be sent until the end)
         paramsObj.players = this.game.players;
         paramsObj.prime = this.game.getDealer().keychain[0].prime; //prime as generated by us
         paramsObj.cardDecks = this.game.cardDecks;
         this.callContractAPI("CPSC_Create", paramsObj).then(result => {
            this.game.debug("Contract create result: ");
            this.game.debug(result, "dir");
         }).catch (err => {
            this.game.debug(err, "err");
         });
      }
   }

   /**
   * Asynchronously calls the contract API and returns the JSON-RPC 2.0 result / error
   * of the call.
   *
   * @param {String} APIFunc The remote API function to invoke.
   * @param {Object} params The parameters to include with the remote function call.
   *
   * @return {Promise} The promise resolves with the parsed JSON-RPC 2.0 result or
   * error (native object) of the call. Currently there is no rejection state.
   */
   async callContractAPI(APIFunc, params) {
      this.game.debug ("CypherPokerContract.callContractAPI(\"" + APIFunc + "\", " + params + ")");
      var sendObj = new Object();
      for (var item in params) {
         sendObj[item] = params[item];
      }
      sendObj.user_token = this.cypherpoker.p2p.userToken;
      sendObj.server_token = this.cypherpoker.p2p.serverToken;
      var requestID = "CPSC" + String(Math.random()).split(".")[1];;
      var rpc_result = await RPC(APIFunc, sendObj, this.cypherpoker.p2p.webSocket, false, requestID);
      var result = JSON.parse(rpc_result.data);
      //since messages over web sockets are asynchronous the next immediate message may not be ours so:
      while (requestID != result.id) {
         rpc_result = await this.cypherpoker.p2p.webSocket.onEventPromise("message");
         result = JSON.parse(rpc_result.data);
         //we could include a max wait limit here
      }
      return (result);
   }

}
