const Game = require('./Game');

const handler = {
  users: {},
  playingGroups: [],
  addUser(id, connection) {
    this.users = {
      ...this.users,
      [id]: { id, connection, phase: 'waiting', confirm: false }
    };
  },
  handleMessage(userId, msgObject) {
    switch(msgObject.type) {
      case 'addData':
        this.addUserData(userId, msgObject);
        this.sendUserListToGroup(userId);
        break;
      case 'confirm':
        this.userConfirms(userId);
        this.sendUserListToGroup(userId);
        this.checkGroupConfirmation(userId);
        break;
      case 'move':
        this.move(userId, msgObject.data.cardId);
        break;
      case 'pass':
        this.pass(userId);
        break;
      case 'skip':
        this.skip(userId);
        break;
    }
  },
  addUserData(id, data) {
    this.users = {
      ...this.users,
      [id]: {
        ...this.users[id],
        username: data.username,
        groupSize: data.groupSize
      }
    };
  },
  sendUserListToGroup(userId, toDelete) {
    const { groupSize } = this.users[userId];
    const userList = this.getUserList(groupSize);
    const userGroups = this.splitUserList(userList, groupSize);
    for (let userGroup of userGroups) {
      if (toDelete) userGroup = userGroup.filter(({id}) => id !== userId);
      const joinedUsers = userGroup.map(({username, confirm}) => ({username, confirm}));
      const msgObject = { type: 'joinedUsers', data: { joinedUsers } };
      for (const user of userGroup) {
        this.sendMessage(user.id, msgObject);
      }
    }
  },
  getUserList(groupSize) {
    const userList = [];
    for (const userId in this.users) {
      if (this.users[userId].groupSize === groupSize && 
          this.users[userId].phase === 'waiting') {
        userList.push(this.users[userId]);
      }
    }
    return userList;
  },
  splitUserList(userList, groupSize) {
    const userGroups = [];
    for (let i = 0; i < userList.length; i++) {
      if (i % groupSize === 0) userGroups.push([]);
      userGroups[userGroups.length - 1].push(userList[i]);
    }
    return userGroups;
  },
  userConfirms(id) {
    this.users = {
      ...this.users,
      [id]: {
        ...this.users[id],
        confirm: true
      }
    };
  },
  checkGroupConfirmation(userId) {
    const { groupSize } = this.users[userId];
    const userList = this.getUserList(groupSize);
    const userGroups = this.splitUserList(userList, groupSize);
    for (const userGroup of userGroups) {
      const confirmUsers = userGroup.filter(user => user.confirm);
      const allConfirm = confirmUsers.length === userGroup.length;
      if (allConfirm) {
        const msgObject = { type: 'allUsersConfirm' };
        for (const user of userGroup) {
          this.sendMessage(user.id, msgObject);
        }
        this.startGame(userGroup);
      }
    }
  },
  startGame(userGroup) {
    const id = this.playingGroups.length ? 
      this.playingGroups[this.playingGroups.length - 1].id + 1 :
      0;
    this.changeGroupPhase(userGroup);
    this.sendInitialUpdates(userGroup);
    const game = new Game(userGroup);
    const unsubscribe = game.subscribe(this.handleGameStateUpdates.bind(this, id));
    this.playingGroups = [
      ...this.playingGroups,
      { id, game, users: userGroup, unsubscribe }
    ];
    game.startGame();
  },
  changeGroupPhase(userGroup) {
    for (const user of userGroup) {
      this.users = {
        ...this.users,
        [user.id]: {
          ...this.users[user.id],
          phase: 'playing'
        }
      };
    }
  },
  sendInitialUpdates(userGroup) {
    const usernames = userGroup.map(user => user.username);
    for (const [index, user] of userGroup.entries()) {
      if (!user) continue;
      const msgObject = {
        type: 'gameStateUpdate',
        data: { 
          updates: [
            { prop: 'players', value: usernames },
            { prop: 'userIndex', value: index }
          ] 
        }
      };
      this.sendMessage(user.id, msgObject);
    }
  },
  handleGameStateUpdates(id, updates, users, isLastUpdate) {
    for (const user of users) {
      if (!this.users[user.id]) continue;
      const msgObject = {
        type: 'gameStateUpdate',
        data: { updates }
      };
      this.sendMessage(user.id, msgObject);
    }
    if (isLastUpdate) this.deletePlayingGroup(id);
  },
  sendMessage(userId, msgObject) {
    const message = JSON.stringify(msgObject);
    this.users[userId].connection.sendUTF(message);
  },
  lostConnectionWithUser(userId) {
    const playingGroup = this.getPlayingGroupByUserId(userId);
    if (playingGroup) {
      const user = playingGroup.users.filter(user => user.id === userId)[0];
      playingGroup.game.lostConnection(user);
    }
  },
  move(userId, cardId) {
    const playingGroup = this.getPlayingGroupByUserId(userId);
    const user = this.users[userId];
    playingGroup.game.makeMove(user, cardId);
  },
  pass(userId) {
    const playingGroup = this.getPlayingGroupByUserId(userId);
    const user = this.users[userId];
    playingGroup.game.pass(user);
  },
  skip(userId) {
    const playingGroup = this.getPlayingGroupByUserId(userId);
    const user = this.users[userId];
    playingGroup.game.skip(user);
  },
  deleteUser(id) {
    const { [id]: user, ...users } = this.users;
    if (user.phase === 'waiting') this.sendUserListToGroup(id, true);
    if (user.phase === 'playing') this.lostConnectionWithUser(id);
    this.users = users;
  },
  getPlayingGroupByUserId(userId) {
    for (const group of this.playingGroups) {
      if (group.users.map(user => user.id).includes(userId)) return group;
    }
  },
  deletePlayingGroup(id) {
    const playingGroup = this.playingGroups.filter(group => group.id === id)[0];
    playingGroup.unsubscribe();
    this.playingGroups = this.playingGroups.filter(group => group.id !== id);
  }
};

module.exports = handler;