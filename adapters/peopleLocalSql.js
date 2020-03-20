const axios_general = require('axios');
const globals = require('../config/globals');
const {
    handleError
} = require('../utils/errors');

let axios = axios_general.create();
axios.defaults.timeout = globals.MAX_TIME_OUT;

const remoteCenzontleURL = "http://localhost:3000/graphql";
const iriRegex = new RegExp('peopleLocal');

module.exports = class peopleLocalSql {


    static recognizeId(iri) {
        return iriRegex.test(iri);
    }

    static readById(iri) {
        let query = `query readOnePerson{readOnePerson(internalPersonId: "${iri}"){ internalPersonId        firstName
            lastName
            email
            companyId
      }}  `;

        return axios.post(remoteCenzontleURL, {
            query: query
        }).then(res => {
            let data = res.data.data.readOnePerson;
            return data;
        }).catch(error => {
            error['url'] = remoteCenzontleURL;
            handleError(error);
        });
    }

    static countRecords(search) {
        let query = `query countPeople($search: searchPersonInput){
    countPeople(search: $search)
    }`

        return axios.post(remoteCenzontleURL, {
            query: query,
            variables: {
                search: search
            }
        }).then(res => {
            return res.data.data.countPeople;
        }).catch(error => {
            error['url'] = remoteCenzontleURL;
            handleError(error);
        });
    }

    static readAllCursor(search, order, pagination) {
        //check valid pagination arguments
        let argsValid = (pagination === undefined) || (pagination.first && !pagination.before && !pagination.last) || (pagination.last && !pagination.after && !pagination.first);
        if (!argsValid) {
            throw new Error('Illegal cursor based pagination arguments. Use either "first" and optionally "after", or "last" and optionally "before"!');
        }
        let query = `query peopleConnection($search: searchPersonInput $pagination: paginationCursorInput $order: [orderPersonInput]){
      peopleConnection(search:$search pagination:$pagination order:$order){ edges{cursor node{  internalPersonId  firstName
         lastName
         email
         companyId
        } } pageInfo{ startCursor endCursor hasPreviousPage hasNextPage } } }`

        return axios.post(remoteCenzontleURL, {
            query: query,
            variables: {
                search: search,
                order: order,
                pagination: pagination
            }
        }).then(res => {
            return res.data.data.peopleConnection;
        }).catch(error => {
            error['url'] = remoteCenzontleURL;
            handleError(error);
        });
    }

    static get name() {
        return "peopleLocalSql";
    }
}