const GameState = require('./GameState');

class Game {
  constructor(users) {
    this.users = users;
    this.gameState = new GameState();
    this.subscriber = null;
    this.unsubscribe = null;
  }
  subscribe(fn) {
    this.subscriber = fn;
    return () => this.subscriber = null;
  }
  update(updates, users) {
    const isLastUpdate = this.isLastUpdate(updates);
    if (isLastUpdate) {
      this.subscriber(updates, users, true);
      this.unsubscribe();
    } else this.subscriber(updates, users, false);
  }
  startGame() {
    this.unsubscribe = this.gameState.subscribe((updates, user) => {
      const users = user ? [user] : this.users;
      this.update(updates, users);
    });
    this.gameState.initNewGame(this.users);
    this.gameState.startGame();
  }
  lostConnection(lostUser) {
    this.users = this.users.filter(user => user.id !== lostUser.id);
    this.gameState.playerLeft(lostUser);
  }
  makeMove(user, cardId) {
    this.gameState.makeUserMove(user, cardId);
  }
  pass(user) {
    this.gameState.pass(user);
  }
  skip(user) {
    this.gameState.skip(user);
  }
  isLastUpdate(updates) {
    for (const update of updates) {
      if (update.prop === 'isPlaying') return true;
    }
    return false;
  }
}

module.exports = Game;