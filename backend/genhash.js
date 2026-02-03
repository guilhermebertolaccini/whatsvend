const argon2 = require('argon2');
argon2.hash('abc123').then(h => console.log(h));
