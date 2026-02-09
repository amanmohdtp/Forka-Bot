// leaderboardPlugin.js

/**
 * Text-only leaderboard plugin
 * This plugin creates a simple text leaderboard, allowing users to add their scores and view the leaderboard.
 **/

class Leaderboard {
    constructor() {
        this.scores = {};
    }

    addScore(user, score) {
        if (!this.scores[user]) {
            this.scores[user] = 0;
        }
        this.scores[user] += score;
        return this.getLeaderboard();
    }

    getLeaderboard() {
        const leaderboard = Object.entries(this.scores)
            .sort((a, b) => b[1] - a[1])
            .map(([user, score]) => `${user}: ${score}`);
        return leaderboard.length > 0 ? leaderboard.join('\n') : 'No scores yet.';
    }
}

// Example usage:
// const leaderboard = new Leaderboard();
// leaderboard.addScore('User1', 10);
// leaderboard.addScore('User2', 20);
// console.log(leaderboard.getLeaderboard());
