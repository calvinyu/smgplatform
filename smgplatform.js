'use strict';

angular.module('myApp', [])
  .controller('Ctrl', 
    function ($sce, $scope, $rootScope, $log, $window, serverApiService, platformMessageService) {

    // initializing some global variables
    $scope.showGame = false;
    $scope.openingMove = false;
    $scope.playerInfo = null;
    var gameUrl;

    // check to see if user is already logged in
    if(window.localStorage.getItem("playerInfo")){
      $scope.loggedIn = true;
      $scope.playerInfo = JSON.parse(window.localStorage.getItem("playerInfo"));
    }else{
      $scope.loggedIn = false;
    }

    /*
    * functions that interact with the server
    */

    // if gameId is updated, then fetch my list of matches that correspond to the new gameID
    $scope.$watch("gameId", function (newValue, oldValue) {
      if($scope.gameId != null){
        var message = [ // GET_GAMES
          {
            getGames: {
              gameId: $scope.gameId
            }
          }
        ];
        serverApiService.sendMessage(message, function (response) {
          $scope.response = angular.toJson(response, true);
          gameUrl = response[0].games[0].gameUrl;
          $scope.getMyMatches();
        });
      }
    }, true);

    // get a playerId and accessSignature for player
    $scope.registerPlayerAsGuest = function () {
      var displayName = "Guest-" + Math.floor(Math.random()*1000);

      var message = [ // REGISTER_PLAYER
        {
          registerPlayer: {
            displayName: displayName, 
            avatarImageUrl: "images/avatar0.png"
          }
        }
      ];

      serverApiService.sendMessage(message, function (response) {
        $scope.response = angular.toJson(response, true);
        $scope.loggedIn = true;
        
        window.localStorage.setItem("playerInfo", angular.toJson(response[0].playerInfo, true));
        $scope.playerInfo = JSON.parse(window.localStorage.getItem("playerInfo"));
      });
    };

    // ask server for a list of all the games in the server's library
    $scope.getGames = function(){
      var message = [ // GET_GAMES
        {
          getGames: {}
        }
      ];
      serverApiService.sendMessage(message, function (response) {
        $scope.response = angular.toJson(response, true);
        $scope.games = response[0].games;
      });
    };
    $scope.getGames();

    // if player has selected a game, find a list of their ongoing matches in that game
    $scope.getMyMatches = function(){
      if($scope.gameId == null){
        alert("select a game first!");
        return;
      }
      var message = [ // GET_PLAYER_MATCHES
        {
          getPlayerMatches: {
            gameId: $scope.gameId, 
            getCommunityMatches: false, 
            myPlayerId:$scope.playerInfo.myPlayerId, 
            accessSignature:$scope.playerInfo.accessSignature
          }
        }
      ];
      serverApiService.sendMessage(message, function (response) {
        $scope.response = angular.toJson(response, true);
        $scope.myMatches = response[0].matches;
      });
    };

    // if player has selected a game, find a match to join, or create a new match
    $scope.reserveAutoMatch = function(){
      if(!$scope.loggedIn){
        alert("log in first!");
        return;
      }
      if($scope.gameId == null){
        alert("select a game first!");
        return;
      }

      var message = [ // RESERVE_AUTO_MATCH
        {
          reserveAutoMatch: {
            tokens:0, 
            numberOfPlayers:2, 
            gameId: $scope.gameId, 
            myPlayerId:$scope.playerInfo.myPlayerId, 
            accessSignature:$scope.playerInfo.accessSignature
          }
        }
      ];
      serverApiService.sendMessage(message, function (response) {
        $scope.response = angular.toJson(response, true);
        // if there is a match that is joinable
        if(response[0].matches.length > 0){
          $scope.showGame = true;
          $scope.matchId = response[0].matches[0].matchId;
          $scope.history = response[0].matches[0].history;
          $scope.yourPlayerIndex = 1;
        }else{ // you are creating a match
          $scope.showGame = true;
          $scope.openingMove = true;
          $scope.yourPlayerIndex = 0;
        }
        $scope.gameUrl = $sce.trustAsResourceUrl(gameUrl);
      });
    };

    // creates a new game on the server, making you player one
    $scope.createNewGameOnServer = function(move){
      var message = [ // NEW_MATCH
        {
          newMatch: {
            gameId: $scope.gameId, 
            tokens: 0, 
            move: move, 
            startAutoMatch: { 
              numberOfPlayers : 2 
            }, 
            myPlayerId:$scope.playerInfo.myPlayerId, 
            accessSignature:$scope.playerInfo.accessSignature
          }
        }
      ];
      serverApiService.sendMessage(message, function (response) {
        $scope.response = angular.toJson(response, true);
        $scope.matchId = response[0].matches[0].matchId;
        $scope.history = response[0].matches[0].history;

        // this seems like a LOT of work to find turn index
        // I use zero because I know it is the first entry
        var turnIndexAfter = $scope.getTurnIndex(0);
        platformMessageService.sendMessage({ // must check if the move is ok
          isMoveOk: {
            move: move,
            stateAfterMove: $scope.history.stateAfterMoves[0],
            stateBeforeMove: {},
            turnIndexBeforeMove: 0,
            turnIndexAfterMove: turnIndexAfter
          }
        });
      });
    };

    $scope.sendMoveToServer = function(move){
      var message = [ // MADE_MOVE
        {
          madeMove: {
            matchId:$scope.matchId, 
            move: move, 
            moveNumber: $scope.history.moves.length, 
            myPlayerId:$scope.playerInfo.myPlayerId, 
            accessSignature:$scope.playerInfo.accessSignature
          }
        }
      ];
      serverApiService.sendMessage(message, function (response) {
        $scope.response = angular.toJson(response, true);
        $scope.history = response[0].matches[0].history;

        var turnIndexBefore = $scope.getTurnIndex($scope.history.moves.length - 2);
        var turnIndexAfter = $scope.getTurnIndex($scope.history.moves.length - 1);
        platformMessageService.sendMessage({ // must check if the move is ok
          isMoveOk: {
            move: move,
            stateAfterMove: $scope.history.stateAfterMoves[$scope.history.moves.length - 1],
            stateBeforeMove: $scope.history.stateAfterMoves[$scope.history.moves.length - 2],
            turnIndexBeforeMove: turnIndexBefore,
            turnIndexAfterMove: turnIndexAfter
          }
        });

      });
    };

    /*
    * platform interaction
    */
    var gotGameReady = false;
    platformMessageService.addMessageListener(function (message) {
      if(message.gameReady !== undefined){// this executes when the game emits a message that it has been loaded
        gotGameReady = true;
        $scope.gameReadyGame = message.gameReady;
        if($scope.openingMove){// update ui to get everything ready
          platformMessageService.sendMessage({
            updateUI : {
              move : [],
              turnIndexBeforeMove : 0,
              turnIndexAfterMove : 0,
              stateBeforeMove : {},
              stateAfterMove : {},
              yourPlayerIndex : $scope.yourPlayerIndex,
              playersInfo : [
                {
                  playerId: $scope.playerInfo.myPlayerId, 
                  displayName: $scope.playerInfo.displayName, 
                  avatarImageUrl: $scope.playerInfo.avatarImageUrl
                }, 
                {
                  playerId : null
                }
              ],
              endMatchScores: null
            }
          });
        }else{ // this executes when you load a game that already has moves on it
          // go through each move in the history and check them and then execute them
          for(var i = 0; i < $scope.history.moves.length; i++){
            var turnIndexBefore = $scope.getTurnIndex(i-1);
            var turnIndexAfter = $scope.getTurnIndex(i);
            var stateBefore;
            if(i == 0){
              stateBefore = {};
            }else{
              stateBefore = $scope.history.stateAfterMoves[0];
            }
            var stateAfter = $scope.history.stateAfterMoves[i];
            
            platformMessageService.sendMessage({
              isMoveOk: {
                move: $scope.history.moves[i],
                stateAfterMove: stateAfter,
                stateBeforeMove: stateBefore,
                turnIndexBeforeMove: turnIndexBefore,
                turnIndexAfterMove: turnIndexAfter
              }
            });
          }
        }
      }else if(message.isMoveOkResult !== undefined) { // this executes when an isMoveOkResult message is sent
        if (message.isMoveOkResult !== true) {
          $window.alert("isMoveOk returned " + message.isMoveOkResult);
        }else{
          var stateAfter = $scope.history.stateAfterMoves[$scope.history.stateAfterMoves.length - 1];
          var stateBefore;

          if($scope.history.moves.length > 1){
            stateBefore = $scope.history.stateAfterMoves[$scope.history.stateAfterMoves.length - 2];  
          }else{
            stateBefore = {};
          }
          
          var move = $scope.history.moves[$scope.history.moves.length - 1];
          var turnIndexAfter = $scope.getTurnIndex($scope.history.moves.length - 1);
          var turnIndexBefore = $scope.getTurnIndex($scope.history.moves.length - 2);

          platformMessageService.sendMessage({// must update the UI after realizing a move is OK
            updateUI : {
              move : move,
              turnIndexBeforeMove : turnIndexBefore,
              turnIndexAfterMove : turnIndexAfter,
              stateBeforeMove : stateBefore,
              stateAfterMove : stateAfter,
              yourPlayerIndex : $scope.yourPlayerIndex,
              playersInfo : [
                {
                  playerId: $scope.playerInfo.myPlayerId, 
                  displayName: $scope.playerInfo.displayName, 
                  avatarImageUrl: $scope.playerInfo.avatarImageUrl
                }, 
                {
                  playerId : null
                }
              ],
              endMatchScores: null
            }
          });
        }
      }else if(message.makeMove !== undefined) {
        //send move to server
        if($scope.openingMove){
          $scope.createNewGameOnServer(message.makeMove);
          $scope.openingMove = false;
        }else{
          $scope.sendMoveToServer(message.makeMove);
        }
      }
    });

    /*
    * helper methods
    */
    $scope.getTurnIndex = function(moveIndex){
      if(!$scope.history){
        return -1;
      }
      // this means it is the first move;
      if(moveIndex < 0){
        return 0;
      }
      for(var i = 0; i < $scope.history.moves[moveIndex].length; i++){
          if($scope.history.moves[moveIndex][i].setTurn !== undefined){
              return $scope.history.moves[moveIndex][i].setTurn.turnIndex;
          }
        }
    }

    // this is just to verify local storage is working
    $scope.checkIdAndSig = function(){
      if(!$scope.loggedIn){
        alert("log in first!");
        return;
      }
      alert(window.localStorage.getItem("myPlayerId") + " " + window.localStorage.getItem("accessSignature"));
    };

  })
  .factory('$exceptionHandler', function ($window) {
    return function (exception, cause) {
      exception.message += ' (caused by "' + cause + '")';
      $window.alert(exception.message);
      throw exception;
    };
  });
