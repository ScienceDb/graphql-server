const fs = require('fs');

let migrationsCassandra = {};

module.exports = migrationsCassandra;

fs.readdirSync(__dirname)
    .filter(function(file) {
        return (file.indexOf('.') !== 0) && (file !== 'index.js') && (file.slice(-3) === '.js');
    })
    .forEach(function(file) {
        /*const migrationsCassandraModel = require('./'+ file);
        for (resolver in migrationsCassandraModel){
          migrationsCassandra[resolver] = migrationsCassandraModel[resolver];
        }*/
        let mutation = require('./' + file);
        let mutationName = file.slice(0, file.length - 3);

        if (migrationsCassandra[mutationName]) {
            throw new Error(`Duplicate Cassandra migration name ${mutationName}`);
        }

        migrationsCassandra[mutationName] = mutation;
    });