const config = require('./gameConfig');

const getDeepCopy = obj => {
  const isArray = obj instanceof Array;
  const isObj = typeof obj === 'object' && !isArray;
  if (!isArray && !isObj) return obj;
  if (isArray) {
    const newArray = [];
    for (const [i, elem] of obj.entries()) {
      newArray[i] = getDeepCopy(elem);
    }
    return newArray;
  } 
  // It is object
  const newObj = {};
  for (const prop in obj) {
    newObj[prop] = getDeepCopy(obj[prop]);
  }
  return newObj;
};

class GameState {
  constructor() {
    this.cards = {
      deck: [],
      players: [],
      table: [],
      discarded: []
    };
    this.players = [];
    this.leftPlayers = [];
    this.trumpSuit = null;
    this.attacker = null;
    this.defender = null;
    this.defendSucceed = null;
    this.activePlayers = {
      players: []
    };
    this.maxAttacks = 0;
    this.subscriber = null;
  }
  subscribe(fn) {
    this.subscriber = fn;
    return () => this.subscriber = null;
  }
  update(updates, user) {
    this.subscriber(updates, user);
  }
  initNewGame(players) {
    const deckCards = this.shuffleCards(this.genCards());
    const playerCards = Array.from({length: players.length}, () => ([]));
    this.players = players;
    this.cards = {
      ...this.cards,
      deck: deckCards,
      players: playerCards
    };
    this.update([{ prop: 'cards', value: this.cards }]);
  }
  genCards() {
    const ranks = [
      '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'
    ];
    const values = [
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14
    ];
    const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
    const cards = [];
    for (let i = 0; i < ranks.length; i++) {
      for (let n = 0; n < suits.length; n++) {
        cards.push({
          id: `${ranks[i]}-${suits[n]}`,
          rank: ranks[i],
          suit: suits[n],
          value: values[i]
        });
      }
    }

    return cards;
  }
  shuffleCards(cards) {
    const cardsCopy = getDeepCopy(cards);

    for (let i = cardsCopy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = getDeepCopy(cardsCopy[i]);
      cardsCopy[i] = getDeepCopy(cardsCopy[j]);
      cardsCopy[j] = getDeepCopy(tmp);
    }

    return cardsCopy;
  }
  startGame() {
    this.dealCards();
    this.chooseTrump();
    this.clearGameProps();
    this.startTrick();
  }
  dealCards() {
    const dealerIndex = 0;
    const playersNumber = this.cards.players.length;
    const getNextIndex = index => index + 1 === playersNumber ? 0 : index + 1;
    let index = getNextIndex(dealerIndex);
    while(this.cards.players[index].length < config.maxCardsAfterDealing) {
      this.dealOneCard(index);
      this.update([{ prop: 'cards', value: this.cards }]);
      index = getNextIndex(index);
    }
  }
  chooseTrump() {
    const deckCards = getDeepCopy(this.cards.deck);
    const randomIndex = Math.floor(Math.random() * deckCards.length);
    const card = deckCards[randomIndex];
    deckCards[randomIndex] = deckCards[0];
    deckCards[0] = { ...card, trump: true };
    this.cards = {
      ...this.cards,
      deck: deckCards
    };
    this.trumpSuit = card.suit;
    this.sortPlayerCards();
    this.update([
      { prop: 'cards', value: this.cards },
      { prop: 'trumpSuit', value: this.trumpSuit }
    ]);
  }
  dealOneCard(playerIndex) {
    const deckCards = getDeepCopy(this.cards.deck);
    const playerCards = getDeepCopy(this.cards.players);
    const card = deckCards.pop();
    playerCards[playerIndex].push(card);

    this.cards = {
      ...this.cards,
      deck: deckCards,
      players: playerCards
    };
    this.sortPlayerCards();
  }
  sortPlayerCards() {
    const isTrump = card => card.suit === this.trumpSuit;
    const isEqualSuit = (card1, card2) => {
      if (!this.trumpSuit) return true;
      if (isTrump(card1) && isTrump(card2)) return true;
      if (!isTrump(card1) && !isTrump(card2)) return true;
      return false;
    };

    const playerCards = getDeepCopy(this.cards.players);
    for (const cards of playerCards) {
      cards.sort((a, b) => {
        if (isEqualSuit(a, b)) return a.value - b.value;
        if (isTrump(a) && !isTrump(b)) return 1;
        if (!isTrump(a) && isTrump(b)) return -1;
        return 0;
      });
    }

    this.cards = {
      ...this.cards,
      players: playerCards
    };
  }
  clearGameProps() {
    this.defendSucceed = null;
  }
  startTrick() {
    if (this.getNumberOfActivePlayers() < 2) this.endGame();
    else {
      this.updateActivePlayers();
      this.updateAttackerAndDefender();
      this.updateMaxAttacks();
      this.sendPossibleCardsToUsers();
    }
  }
  getNumberOfActivePlayers() {
    return this.cards.players.filter(cards => cards.length).length;
  }
  updateActivePlayers() {
    const activePlayers = [];
    for (const [index, cards] of this.cards.players.entries()) {
      if (cards.length) {
        const playerObject = { index, pass: false };
        activePlayers.push(playerObject);
      }
    }
    const gameState = this;
    this.activePlayers = {
      players: activePlayers,
      isPlayerInGame(index) {
        return !!this.players.filter(player => player.index === index)[0];
      },
      getNextIndex(index) {
        const indexes = this.players.map(player => player.index);
        let nextIndex;
        for (const i of indexes) {
          if (i > index) {
            nextIndex = i;
            break;
          }
        }
        if (nextIndex === undefined) nextIndex = indexes[0];
        return nextIndex;
      },
      userPass(index) {
        this.players = this.players.map(player => 
          player.index === index ? 
            ({ ...player, pass: true }) : 
            player)
      },
      getPlayerByIndex(index) {
        return this.players.filter(player => player.index === index)[0];
      }
    };
  }
  updateAttackerAndDefender() {
    if (this.defendSucceed === null) this.defineAttackerAndDefenderByLowestTrump();
    else if (this.defendSucceed) {
      if (this.activePlayers.isPlayerInGame(this.defender)) {
        this.attacker = this.defender;
      } else {
        this.attacker = this.activePlayers.getNextIndex(this.defender);
      }
    } else {
      this.attacker = this.activePlayers.getNextIndex(this.defender);
    }

    this.defender = this.activePlayers.getNextIndex(this.attacker);

    this.update([
      { prop: 'attacker', value: this.attacker },
      { prop: 'defender', value: this.defender }
    ])
  }
  defineAttackerAndDefenderByLowestTrump() {
    const playerCards = this.cards.players;
    const playersNumber = playerCards.length;
    let minTrump = {
      playerIndex: null,
      value: 15
    };
    for (const [index, cards] of playerCards.entries()) {
      for (const card of cards) {
        if (card.suit === this.trumpSuit && card.value < minTrump.value) {
          minTrump = {
            playerIndex: index,
            value: card.value
          };
        }
      }
    }

    if (minTrump.playerIndex !== null) {
      this.attacker = minTrump.playerIndex;
    } else {
      const randomIndex = Math.floor(Math.random() * playersNumber);
      this.attacker = randomIndex;
    }
    this.defender = this.activePlayers.getNextIndex(this.attacker);
  }
  updateMaxAttacks() {
    this.maxAttacks = Math.min(
      this.cards.players[this.defender].length,
      config.maxAttacks
    );
  }
  sendPossibleCardsToUsers() {
    let isPossibleMoves = false;
    for (const [index, player] of this.players.entries()) {
      const activePlayer = this.activePlayers.getPlayerByIndex(index);
      const playerPass = activePlayer ? activePlayer.pass : true;
      const possibleCards = playerPass ? [] : this.findPossibleCards(index);
      if (possibleCards.length) isPossibleMoves = true;
      this.update([{prop: 'possibleCards', value: possibleCards}], player);
    }
    return isPossibleMoves;
  }
  findPossibleCards(playerIndex) {
    if (playerIndex === this.defender) return this.findCardsForDefend(playerIndex);
    else return this.findCardsForAttack(playerIndex);
  }
  findCardsForAttack(playerIndex) {
    const attacks = this.cards.table;
    const playerCards = this.cards.players[playerIndex];
    if (attacks.length >= this.maxAttacks) return [];
    if (!attacks.length) {
      if (this.attacker === playerIndex) return playerCards.map(card => card.id);
      return [];
    }

    const tableCards = [];
    for (const attack of attacks) {
      tableCards.push(...attack);
    }
    const tableCardRanks = tableCards.map(card => card.rank);
    return playerCards.filter(card => tableCardRanks.includes(card.rank))
                      .map(card => card.id);
  }
  findCardsForDefend(playerIndex) {
    const playerCards = this.cards.players[playerIndex];
    const notBeatenAttacks = this.cards.table
      .map((attack, index) => ({cards: attack, index}))
      .filter(attack => {
        if (attack.cards.length === 1) return true;
        return false;
      });
    const possibleCards = [];
    for (const attack of notBeatenAttacks) {
      const attackCard = attack.cards[0];
      playerCards.filter(card =>
        this.getHigherCard(card, attackCard).id === card.id
      ).forEach(card => {
        if (!possibleCards.includes(card.id)) possibleCards.push(card.id);
      });
    }
    return possibleCards;
  }
  makeMove(playerIndex, cardId) {
    const isDefender = playerIndex === this.defender;
    const card = this.getCardById(cardId);

    const tableCards = this.addCardToTable(card, isDefender);

    const playerCards = this.cards.players.map((cards, index) => {
      if (index === playerIndex) {
        return cards.filter(playerCard => playerCard.id !== cardId);
      } else return cards;
    });

    this.cards = {
      ...this.cards,
      table: tableCards,
      players: playerCards
    };
    this.update([{ prop: 'cards', value: this.cards }]);
    const isPossibleMoves = this.sendPossibleCardsToUsers();
    if (!isPossibleMoves) this.endTrick();
  }
  addCardToTable(card, defendCard) {
    const tableCards = getDeepCopy(this.cards.table);
    if (defendCard) {
      let attackIndexes = [];
      tableCards.forEach((attack, index) => {
        if (attack.length === 1 &&
            this.getHigherCard(card, attack[0]).id === card.id) {
              attackIndexes.push(index);
        }
      });
      const randomIndex = Math.floor(Math.random() * attackIndexes.length);
      const attackIndex = attackIndexes[randomIndex];
      return tableCards.map((attack, index) =>
        index === attackIndex ? ([ ...attack, card ]) : attack
      );
    } 
    
    return [ ...this.cards.table, [ card] ];
  }
  getCardById(id) {
    for (const place in this.cards) {
      for (const elem of this.cards[place]) {
        if (elem instanceof Array) {
          for (const card of elem) {
            if (card.id === id) return card;
          }
        } else {
          if (elem.id === id) return elem;
        }
      }
    }
  }
  getHigherCard(a, b) {
    if (a.suit === b.suit) {
      if (a.value > b.value) return a;
      else return b;
    }
    if (a.suit === this.trumpSuit) return a;
    return b;
  }
  endTrick() {
    this.defendSucceed = this.cards.table.reduce((bool, attack) =>
      attack.length === 1 ? false : bool, true);

    this.clearTable();
    this.drawCardsFromDeck();
    this.startTrick();
  }
  clearTable() {
    const leftPlayerIndexes = this.getLeftPlayerIndexes();
    const playerCards = getDeepCopy(this.cards.players[this.defender]);
    const discardedCards = getDeepCopy(this.cards.discarded);
    for (const attack of this.cards.table) {
      for (const card of attack) {
        if (this.defendSucceed || leftPlayerIndexes.includes(this.defender)) {
          discardedCards.push(card);
        }
        else playerCards.push(card);
      }
    }
    this.cards = {
      ...this.cards,
      players: this.cards.players.map((cards, index) =>
        index === this.defender ? playerCards : cards),
      discarded: discardedCards,
      table: []
    };
    this.sortPlayerCards();
    this.update([{ prop: 'cards', value: this.cards }]);
  }
  drawCardsFromDeck() {
    const leftPlayerIndexes = this.getLeftPlayerIndexes();
    const playersNumber = this.cards.players.length;
    let playersDrawnCards = 0;
    let index = this.attacker;
    const changePlayers = (index, newCards) =>
      this.cards.players.map((cards, i) => index === i ? newCards : cards);

    while(playersDrawnCards < playersNumber) {
      if (!leftPlayerIndexes.includes(index)) {
        const playerHasCards = this.cards.players[index].length;
        if (playerHasCards < config.maxCardsAfterDealing) {
          const cardsNeeded = config.maxCardsAfterDealing - playerHasCards;
          const playerCards = getDeepCopy(this.cards.players[index]);
          const deckCards = getDeepCopy(this.cards.deck);
  
          for (let i = 0; i < cardsNeeded; i++) {
            if (deckCards.length) {
              const lastDeckCard = deckCards.pop();
              playerCards.push(lastDeckCard);
            }
          }
  
          this.cards = {
            ...this.cards,
            players: changePlayers(index, playerCards),
            deck: deckCards
          };
        }
  
        this.sortPlayerCards();
        this.update([{ prop: 'cards', value: this.cards }]);
      }
      playersDrawnCards++;
      index = index - 1;
      if (index === -1) index = playersNumber - 1;
    }
  }
  endGame() {
    let loser = null;
    for (const [playerIndex, cards] of this.cards.players.entries()) {
      if (cards.length) {
        loser = playerIndex;
        break;
      }
    }
    this.trumpSuit = null;
    this.cards = {
      deck: [],
      players: [],
      table: [],
      discarded: []
    };
    this.update([
      { prop: 'isPlaying', value: false },
      { prop: 'trumpSuit', value: null },
      { prop: 'attacker', value: null },
      { prop: 'defender', value: null },
      { prop: 'loser', value: loser }
    ]);
  }
  getLeftPlayerIndexes() {
    const indexes = [];
    for (const leftPlayer of this.leftPlayers) {
      const index = this.getUserIndex(leftPlayer);
      indexes.push(index);
    }
    return indexes;
  }
  makeUserMove(user, cardId) {
    const userIndex = this.getUserIndex(user);
    const possibleCards = this.findPossibleCards(userIndex);
    if (possibleCards.includes(cardId)) {
      this.makeMove(userIndex, cardId);
    }
  }
  pass(user) {
    const userIndex = this.getUserIndex(user);
    this.activePlayers.userPass(userIndex);
    const isPossibleMoves = this.sendPossibleCardsToUsers();
    if (!isPossibleMoves) this.endTrick();
  }
  skip(user) {
    const userIndex = this.getUserIndex(user);
    if (userIndex === this.attacker && !this.cards.table.length) {
      const firstCard = this.cards.players[userIndex][0];
      this.makeUserMove(user, firstCard.id);
    } else {
      this.activePlayers.userPass(userIndex);
      const isPossibleMoves = this.sendPossibleCardsToUsers();
      if (!isPossibleMoves) this.endTrick();
    }
  }
  getUserIndex(user) {
    let userIndex;
    this.players.forEach((player, i) => {
      if (player.id === user.id) userIndex = i
    });
    return userIndex;
  }
  playerLeft(player) {
    this.leftPlayers = [ ...this.leftPlayers, player ];
    this.movePlayerCardsToDiscarded(player);
  }
  movePlayerCardsToDiscarded(player) {
    const playerIndex = this.getUserIndex(player);
    const discardedCards = getDeepCopy(this.cards.discarded);
    for (const card of this.cards.players[playerIndex]) {
      discardedCards.push(card);
    }
    this.cards = {
      ...this.cards,
      discarded: discardedCards,
      players: this.cards.players.map((cards, index) => 
        index === playerIndex ? ([]) : cards)
    };
    this.update([{ prop: 'cards', value: this.cards }]);
    if ((playerIndex === this.attacker && !this.cards.table.length) ||
        playerIndex === this.defender) {
      this.endTrick();
    }
  }
};

module.exports = GameState;