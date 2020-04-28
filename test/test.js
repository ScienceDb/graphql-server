const expect = require('chai').expect;
const rewire = require('rewire');
const helper = rewire('../utils/helper');
const resolvers = require('../resolvers/index');

describe('Non-empty array', function() {
    it('1. Undefined', function() {
        let val = undefined;
        expect(helper.isNonEmptyArray(val)).to.be.false;
    });

    it('2. Null', function() {
        let val = null;
        expect(helper.isNonEmptyArray(val)).to.be.false;
    });

    it('3. Simple type', function() {
        let val = 0;
        expect(helper.isNonEmptyArray(val)).to.be.false;
    });

    it('4. Empty Object', function() {
        let val = {};
        expect(helper.isNonEmptyArray(val)).to.be.false;
    })

    it('5. Object', function() {
        let val = {zero: 0, one: 1};
        expect(helper.isNonEmptyArray(val)).to.be.false;
    });

    it('6. Empty Array', function() {
        let val = [];
        expect(helper.isNonEmptyArray(val)).to.be.false;
    });

    it('7. Non-Empty Array', function() {
        let val = [0];
        expect(helper.isNonEmptyArray(val)).to.be.true;
    });
});

describe('Not undefined and not null', function() {
    it('1. Undefined', function() {
        let val = undefined;
        expect(helper.isNotUndefinedAndNotNull(val)).to.be.false;
    });

    it('2. Null', function() {
        let val = null;
        expect(helper.isNotUndefinedAndNotNull(val)).to.be.false;
    })

    it('3. Zero', function() {
        let val = 0;
        expect(helper.isNotUndefinedAndNotNull(val)).to.be.true;
    })

    it('4. Simple type', function() {
        let val = 1;
        expect(helper.isNotUndefinedAndNotNull(val)).to.be.true;
    })

    it('5. Empty Object', function() {
        let val = {};
        expect(helper.isNotUndefinedAndNotNull(val)).to.be.true;
    })

    it('6. Object', function() {
        let val = {zero: 0, one: 1};
        expect(helper.isNotUndefinedAndNotNull(val)).to.be.true;
    })

    it('7. Empty Array', function() {
        let val = [];
        expect(helper.isNotUndefinedAndNotNull(val)).to.be.true;
    })

    it('8. Array', function() {
        let val = [0];
        expect(helper.isNotUndefinedAndNotNull(val)).to.be.true;
    })
})

describe('Count Records in Association Arguments', function() {
    it('1. Integers first test', function() {
        expect(helper.countRecordsInAssociationArgs({addDogs: 2, addCats: 1}, ['addDogs', 'addCats'])).to.equal(2);
    })
    it('2. Integer second test', function() {
        expect(helper.countRecordsInAssociationArgs({addDogs: 2, addCats: 1, addHamsters: 1}, ['addDogs', 'addCats', 'addHamsters'])).to.equal(3);
    })
    it('3. Arrays first test', function() {
        expect(helper.countRecordsInAssociationArgs({addDogs: [4, 2], addCats: 1}, ['addDogs', 'addCats'])).to.equal(3);
    })
    it('4. Arrays second test', function() {
        expect(helper.countRecordsInAssociationArgs({addDogs: [4, 2], addCats: 1, addHamsters: 1}, ['addDogs', 'addCats', 'addHamsters'])).to.equal(4);
    })
});

describe('Unique', function() {
    it('1. Unique array test', function() {
        expect(helper.unique([1, 1, 2, 3, 2])).to.deep.equal([1, 2, 3]);
    });

    it('2. Unique without sorting', function() {
        expect(helper.unique([2, 3, 2, 4, 1, 5])).to.deep.equal([2, 3, 4, 1, 5]);
    })
})

describe('Sanitize association arguments', function() {
    it('1, NOP for already sane arguments', function() {
        const firstArguments = {name: 'FirstPerson', addDogs: [4, 2], addCats: 1, addHamsters: 2};
        let originalArguments = Object.assign({}, firstArguments);
        let newArguments = helper.sanitizeAssociationArguments(originalArguments, ['addDogs', 'addCats', 'addHamsters']);
        expect(newArguments).to.deep.equal(firstArguments);
        expect(originalArguments).to.deep.equal(firstArguments);
    })

    it('2. One argument to be sanitized', function() {
        const firstArguments = {name: 'SecondPerson', addDogs: [4, 2, 4, 3], addCats: 1, addHamsters: 2};
        let originalArguments = Object.assign({}, firstArguments);
        let newArguments = helper.sanitizeAssociationArguments(originalArguments, ['addDogs', 'addCats', 'addHamsters']);
        expect(newArguments).to.deep.equal({name: 'SecondPerson', addDogs: [4, 2, 3], addCats: 1, addHamsters: 2});
        expect(originalArguments).to.deep.equal(firstArguments);
    })

    it('3. All arguments to be sanitized', function() {
        const firstArguments = {name: 'ThirdPerson', addDogs: [4, 2, 4, 3], addCats: [1, 1, 2], addHamsters: [2, 2]};
        let originalArguments = Object.assign({}, firstArguments);
        let newArguments = helper.sanitizeAssociationArguments(originalArguments, ['addDogs', 'addCats', 'addHamsters']);
        expect(newArguments).to.deep.equal({name: 'ThirdPerson', addDogs: [4, 2, 3], addCats: [1, 2], addHamsters: [2]});
        expect(originalArguments).to.deep.equal(firstArguments);
    })
})

describe('Check authorization on association args', function() {
    var oldModelIndex;
    var oldModulExports;
    var oldCheckAuthorization;

    const associationArgsDef = {
        'addPerson': 'Person',
        'removePerson': 'Person',
        'addDogs': 'Dog', 
        'removeDogs': 'Dog', 
        'addCat': 'Cat',
        'removeCat': 'Cat'
      }

    before(function() {
        oldModelIndex = helper.__set__('models_index', {
            Person: {
                definition: {storageType: 'sql'}
            },
            Dog: {
                definition: {storageType: 'sql'}
            },
            Cat: {
                definition: {storageType: 'distributed-data-model'},
                adapterForIri: id => {
                    if (id % 2 == 1) {
                        return 'oddCat';
                    }
                    return 'evenCat';
                },
                registeredAdapters: {
                    oddCat: 'odd',
                    evenCat: 'even'
                }
            }
        });
        oldModulExports = helper.__set__('module.exports.authorizedAdapters', 
            async (context, adapters, curr) => {
                let res = {};
                let errors = [];
                adapters.forEach(element => {
                    if (element === 'odd') {
                        errors.push(new Error('Too odd'));
                    }
                });
                res.authorizationErrors = errors;
                return await Promise.resolve(res);
            }
        );
        oldCheckAuthorization = helper.__set__('checkAuthorization', async (context, targetModelName, curr) => {
            if (targetModelName === 'dog') {
                throw new Error('Dogs are not allowed in here');
            }
            return await Promise.resolve(true);
        });
    })

    after(function() {
        oldCheckAuthorization();
        oldModulExports();
        oldModelIndex();
    })

    it('1. Person only is allowed', async function() {
        let input = {addPerson: 1};
        let context = null;
        expect(await helper.checkAuthorizationOnAssocArgs(input, context, associationArgsDef)).to.be.true;
    });

    it('2. Dog is always forbidden', async function() {
        let input = {addDog: 1};
        let context = null;
        expect(await helper.checkAuthorizationOnAssocArgs(input, context, associationArgsDef)).to.throw;
    })
    
    it('3. Even cat is allowed', async function() {
        let input = {addCat: 2};
        let context = null;
        expect(await helper.checkAuthorizationOnAssocArgs(input, context, associationArgsDef)).to.be.true;
    })

    it('4. Odd cat is forbidden', async function() {
        let input = {addCat: 1};
        let context = null;
        expect(await helper.checkAuthorizationOnAssocArgs(input, context, associationArgsDef)).to.throw;
    })

    it('5. Allowed when all allowed', async function() {
        let input = {addPerson: 1, addCat: 2};
        let context = null;
        expect(await helper.checkAuthorizationOnAssocArgs(input, context, associationArgsDef)).to.be.true;
    })

    it('6. Forbidden when one is forbidden', async function() {
        let input = {addPerson: 1, addDog: 1, addCat: 2};
        let context = null;
        expect(await helper.checkAuthorizationOnAssocArgs(input, context, associationArgsDef)).to.throw;
    })

    it('7. Delete allowed', async function() {
        let input = {deletePerson: 1};
        let context = null;
        expect(await helper.checkAuthorizationOnAssocArgs(input, context, associationArgsDef)).to.be.true;
    })

    it('8. Delete forbidden', async function() {
        let input = {deleteDog: 1};
        let context = null;
        expect(await helper.checkAuthorizationOnAssocArgs(input, context, associationArgsDef)).to.throw;
    })
})