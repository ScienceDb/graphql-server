const checkAuthorization = require('./check-authorization');
const objectAssign = require('object-assign');
const math = require('mathjs');
const _ = require('lodash');
const models_index = require('../models_index');

  /**
   * paginate - Creates pagination argument as needed in sequelize cotaining limit and offset accordingly to the current
   * page implicit in the request info.
   *
   * @param  {object} req Request info.
   * @return {object}     Pagination argument.
   */
  paginate = function(req) {
    selectOpts = {}
    if (req.query.per_page){ selectOpts['limit'] = req.query.per_page}
    else{ selectOpts['limit'] = 20}
    if (req.query.page) {
      os = (req.query.page - 1) * selectOpts['limit']
      selectOpts['offset'] = os
    }
    return selectOpts
  }

  /**
   * requestedUrl - Recover baseUrl from the request.
   *
   * @param  {object} req Request info.
   * @return {string}     baseUrl from request.
   */
  requestedUrl = function(req) {
    //console.log(req.port)
    //console.log(req.headers.host)
    //let port = req.port|| 2000;
    return req.protocol + '://' + req.headers.host +
      //(port == 80 || port == 443 ? '' : ':' + port) +
      req.baseUrl;
  }

  /**
   * prevNextPageUrl - Creates request string for previous or next page int the vue-table data object.
   *
   * @param  {object} req        Request info.
   * @param  {boolean} isPrevious True if previous page is requestes and false if next page is requested.
   * @return {string}            String request for previous or next page int the vue-table data object.
   */
  prevNextPageUrl = function(req, isPrevious) {
    //console.log("Requested URL", req);
    let baseUrl = requestedUrl(req).replace(/\?.*$/, '')
    let query = ["query="+req.query.query]
    i = isPrevious ? -1 : 1
    // page
    p = req.query.page == '1' ? null : (req.query.page + i)
    query = query.concat(['page=' + p])
    // per_page
    query = query.concat(['per_page=' + (req.query.per_page || 20)])
    // filter
    if (req.query.filter) query = query.concat(['filter=' + req.query.filter])
    // sort
    if (req.query.sort) query = query.concat(['sort=' + req.query.sort])
    // Append query to base URL
    if (query.length > 0) baseUrl += "?" + query.join("&")
    return baseUrl
  }

  /**
   * sort - Creates sort argument as needed in sequelize and accordingly to the order implicit in the resquest info.
   *
   * @param  {object} req Request info.
   * @return {object}     Sort argument object as needed in the schema to retrieve filtered records from a given model.
   */
  sort = function(req) {
    let sortOpts = {}
    if (req.query.sort) {
      sortOpts = {
        order: [req.query.sort.split('|')]
      }
    }
    return sortOpts
  }

  /**
   * search - Creates search argument as needed in sequelize and accordingly to the filter string implicit in the resquest info.
   *
   * @param  {object} req           Request info. This info will contain the substring that will be used to filter records.
   * @param  {array} strAttributes Name of model's attributes
   * @return {object}               Search argument object as needed in the schema to retrieve filtered records from a given model.
   */
  search = function(req, strAttributes) {
    let selectOpts = {}
    if (req.query.filter) {
      let fieldClauses = []
      strAttributes.forEach(function(x) {
        let fieldWhereClause = {}
        if (x !== "id") {
          fieldWhereClause[x] = {
            $like: "%" + req.query.filter + "%"
          }
          fieldClauses = fieldClauses.concat([fieldWhereClause])
        } else {
          if (/^\d+$/.test(req.query.filter)) {
            fieldWhereClause[x] = req.query.filter
            fieldClauses = fieldClauses.concat([fieldWhereClause])
          }
        }
      })
       selectOpts['where'] = {
        $or: fieldClauses
      }
    }
    return selectOpts
  }


// includeAssociations = function (req) {
//     return req.query.excludeAssociations ? {} : {
//       include: [{
//         all: true
//       }]
//     }
// }

/**
 * searchPaginate - Creates one object mergin search, sort, and paginate arguments
 *
 * @param  {object} req           Request info.
 * @param  {array} strAttributes Name of model's attributes.
 * @return {object}               General argument for filtering models in sequelize.
 */
searchPaginate = function(req, strAttributes) {
  return objectAssign(
    search(req, strAttributes),
    sort(req),
    paginate(req)
    //,includeAssociations(req)
  );
}

/**
 * vueTable - Creates object needed to display a vue-table in a vuejs SPA
 *
 * @param  {object} req           Request info.
 * @param  {object} model         Sequelize model which records are intended to be displayed in the vue-table.
 * @param  {array} strAttributes Name of model's attributes.
 * @return {object}               Info for displaying vue-table in a vuejs SPA, including info for automatic pagination.
 */
module.exports.vueTable = function(req, model, strAttributes) {
  let searchOptions = search(req, strAttributes)
  let searchSortPagIncl = searchPaginate( req, strAttributes )
  let queries = []
  queries.push(model.count(searchOptions))
  queries.push(model.findAll(searchSortPagIncl))
  return Promise.all(queries).then(
    function(res) {
      let searchRes = res[0]
      let paginatedSearchRes = res[1]
      let lastPage = math.ceil(searchRes / req.query.per_page)
      return {
        data: paginatedSearchRes,
        total: searchRes,
        per_page: req.query.per_page,
        current_page: req.query.page,
        'from': (req.query.page - 1) * req.query.per_page + 1,
        'to': math.min(searchRes, req.query.page * req.query.per_page),
        last_page: lastPage,
        prev_page_url: (req.query.page == 1) ? null : prevNextPageUrl(
          req, true),
        next_page_url: (req.query.page == lastPage) ? null : prevNextPageUrl(
          req, false)
      }
    })
  }

  /**
   * modelAttributes - Return info about each column in the model's table
   *
   * @param  {Object} model Sequelize model from which the info will be given.
   * @return {Array}       Array of objects, each object contains info for each attribute in the model
   */
  modelAttributes = function(model) {
      return model.sequelize.query(
        "SELECT column_name, data_type, is_nullable, column_default " +
        "FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '" +
        model.tableName + "'", {
          type: model.sequelize.QueryTypes.SELECT
        }
      )
    }

  //attributes to discard
  discardModelAttributes = ['createdAt', 'updatedAt']

  /**
   * filterModelAttributesForCsv - Filter attributes from a given model
   *
   * @param  {Object} model        Sequelize model from which the attributes will be filtered
   * @param  {Array} discardAttrs Array of attributes to discard
   * @return {Array}              Filtered attributes
   */
  filterModelAttributesForCsv = function(model, discardAttrs) {
    discardAttrs = discardAttrs || discardModelAttributes
    modelPrimaryKey = model.primaryKeyField
    if (modelPrimaryKey)
      discardAttrs = discardAttrs.concat([modelPrimaryKey])
    return modelAttributes(model).then(function(x) {
      return x.filter(function(i) {
        return discardAttrs.indexOf(i.column_name) < 0
      })
    })
  }

  /**
   * csvTableTemplate - Returns template of model, i.e. header of each column an its type
   *
   * @param  {Object} model         Sequelize model from which the template will be returned.
   * @param  {Array} discardAttrs Attributes to discard from the template
   * @return {Array}              Array of strings, one for header and one for the attribute't type.
   */
  module.exports.csvTableTemplate = function(model, discardAttrs) {
    return filterModelAttributesForCsv(model,
      discardAttrs).then(function(x) {
      csvHeader = []
      csvExmplRow = []
      x.forEach(function(i) {
        csvStr = i.data_type
        if (i.is_nullable.toLowerCase() === 'false' || i.is_nullable.toLowerCase() ===
          'no' || i.is_nullable === 0)
          csvStr += ",required"
        if (i.column_default)
          csvStr += ",default:" + i.column_default
        csvHeader = csvHeader.concat([i.column_name])
        csvExmplRow = csvExmplRow.concat([csvStr])
      })
      return [csvHeader.join(','), csvExmplRow.join(',')]
    })
  }

  /**
   * parseOrderCursor - Parse the order options and return the where statement for cursor based pagination (forward)
   *
   * Returns a set of {AND / OR} conditions that cause a ‘WHERE’ clause to deliver only the records ‘greater that’ a given cursor.
   *
   * The meaning of a record being ‘greater than’ a given cursor is that any of the following conditions are fullfilled for the given cursor,
   * order set and idAttribute:
   *
   *    (1) At least the idAttribute of the record is greater than the idAttribute of the cursor if the idAttribute’s order is ASC,
   *    or smaller than if it is DESC.
   *
   *    This condition is sufficient to the record being ‘greater than’ a given cursor, but not strictly necessary.
   *    That is, if some field, different of the idAttribute, appears before the idAttribute on the order array,
   *    and this field fulfills condition 2.a, then the record is considered being ‘greater than’ the given cursor.
   *
   *    (2) If other fields different from idAttribute are given on the order set, as entries of the form [value, ORDER], then, starting from
   *    the first entry, we test the following condition on it:
   *
   *        a) If record.value  is [ > on ASC, or  < on DESC] than cursor.value, then this record is greater than the given cursor.
   *        b) If record.value  is equal to  cursor.value,  then:
   *            i) test the next value on cursor set to determine if it fullfils condition 1) or some of the subconditions 2).[a, b, c],
   *               in order tho determine if the record is 'greater than', or not, the given cursor.
   *        c) else: this record is not greater than the given cursor.
   *
   *
   *
   * @param  {Array} order  Order entries. Must contains at least the entry for 'idAttribute'.
   * @param  {Object} cursor Cursor record taken as start point(exclusive) to create the where statement.
   * @param  {String} idAttribute  idAttribute of the calling model.
   * @param  {Boolean} includeCursor Boolean flag that indicates if a strict or relaxed operator must be used for produce idAttribute conditions.
   * @return {Object}        Where statement to start retrieving records after the given cursor holding the order conditions.
   */
  module.exports.parseOrderCursor = function(order, cursor, idAttribute, includeCursor){
    /**
     * Checks
     */
    //idAttribute:
    if(idAttribute===undefined||idAttribute===null||idAttribute===''){
      return {};
    }
    //order: must have idAttribute
    if(!order||!order.length||order.length===0||
      !order.map( orderItem=>{return orderItem[0] }).includes(idAttribute)) {
        return {};
    }
    //cursor: must have idAttribute
    if(cursor===undefined||cursor===null||typeof cursor!=='object'||cursor[idAttribute] === undefined){
      return {};
    }

    /**
     * Construct AND/OR conditions using a left-recursive grammar (A => Aa).
     *
     * The base step of the recursion will produce the conditions for the last entry (most right) on the order-array.
     * And each recursive step will produce the conditions for the other entries, starting from the last to the first (from right to left).
     *
     *    order: [ [0], [1], [2], ..., [n]]
     *             |<----------|        |
     *             recursive steps      base step
     *             from right to left
     *
     */
    //index of base step
    let last_index = order.length-1;
    //index of the starting recursive step
    let start_index = order.length-2;

    /*
     * Base step.
     */

      /*
       * Set operator for base step.
       */
    //set operator according to order type.
    let operator = order[last_index][1] === 'ASC' ? '$gte' : '$lte';
    //set strictly '>' or '<' for idAttribute (condition (1)).
    if (!includeCursor && order[last_index][0] === idAttribute) { operator = operator.substring(0, 3); }

      /*
       * Produce condition for base step.
       */
    let where_statement = {
      [order[last_index][0]]: { [operator]: cursor[order[last_index][0]] }
    }

    /*
     * Recursive steps.
     */
    for( let i= start_index; i>=0; i-- ){

      /**
       * Set operators
       */
      //set relaxed operator '>=' or '<=' for condition (2.a or 2.b)
      operator = order[i][1] === 'ASC' ? '$gte' : '$lte';
      //set strict operator '>' or '<' for condition (2.a).
      let strict_operator = order[i][1] === 'ASC' ? '$gt' : '$lt';
      //set strictly '>' or '<' for idAttribute (condition (1)).
      if(!includeCursor && order[i][0] === idAttribute){ operator = operator.substring(0, 3);}

      /**
       * Produce: AND/OR conditions
       */
      where_statement = {
        ['$and'] :[
          /**
           * Set
           * condition (1) in the case of idAttribute or
           * condition (2.a or 2.b) for other fields.
           */
          { [order[i][0] ] : { [ operator ]: cursor[ order[i][0] ] } },

          { ['$or'] :[
            /**
             * Set
             * condition (1) in the case of idAttribute or
             * condition (2.a) for other fields.
             */
            { [order[i][0]]: { [strict_operator]: cursor[ order[i][0] ]} },

            /**
             * Add the previous produced conditions.
             * This will include the base step condition as the most right condition.
             */
            where_statement  ]
          }
        ]
      }
    }
    return where_statement;
  }

  /**
   * parseOrderCursorBefore - Parse the order options and return the where statement for cursor based pagination (backward)
   *
   * Returns a set of {AND / OR} conditions that cause a ‘WHERE’ clause to deliver only the records ‘lesser that’ a given cursor.
   *
   * The meaning of a record being ‘lesser than’ a given cursor is that any of the following conditions are fullfilled for the given cursor,
   * order set and idAttribute:
   *
   *    (1) At least the idAttribute of the record is greater than the idAttribute of the cursor if the idAttribute’s order is DESC,
   *    or smaller than if it is ASC.
   *
   *    This condition is sufficient to the record being 'lesser than’ a given cursor, but not strictly necessary.
   *    That is, if some field, different of the idAttribute, appears before the idAttribute on the order array,
   *    and this field fulfills condition 2.a, then the record is considered being 'lesser than’ the given cursor.
   *
   *    (2) If other fields different from idAttribute are given on the order set, as entries of the form [value, ORDER], then, starting from
   *    the first entry, we test the following condition on it:
   *
   *        a) If record.value  is   [ > on DESC, or  < on ASC] than cursor.value, then this record is lesser than the given cursor.
   *        b) If record.value  is equal to  cursor.value,  then:
   *            i) test the next value on cursor set to determine if it fullfils condition 1) or some of the subconditions 2).[a, b, c],
   *               in order tho determine if the record is 'lesser than', or not, the given cursor.
   *        c) else: this record is not lesser than the given cursor.
   *
   *
   *
   * @param  {Array} order  Order entries. Must contains at least the entry for 'idAttribute'.
   * @param  {Object} cursor Cursor record taken as start point(exclusive) to create the where statement.
   * @param  {String} idAttribute  idAttribute of the calling model.
   * @param  {Boolean} includeCursor Boolean flag that indicates if a strict or relaxed operator must be used for produce idAttribute conditions.
   * @return {Object}        Where statement to start retrieving records after the given cursor holding the order conditions.
   */
  module.exports.parseOrderCursorBefore = function(order, cursor, idAttribute, includeCursor){
    /**
     * Checks
     */
    //idAttribute:
    if(idAttribute===undefined||idAttribute===null||idAttribute===''){
      return {};
    }
    //order: must have idAttribute
    if(!order||!order.length||order.length===0||
      !order.map( orderItem=>{return orderItem[0] }).includes(idAttribute)) {
        return {};
    }
    //cursor: must have idAttribute
    if(cursor===undefined||cursor===null||typeof cursor!=='object'||cursor[idAttribute] === undefined){
      return {};
    }

    /**
     * Construct AND/OR conditions using a left-recursive grammar (A => Aa).
     *
     * The base step of the recursion will produce the conditions for the last entry (most right) on the order-array.
     * And each recursive step will produce the conditions for the other entries, starting from the last to the first (from right to left).
     *
     *    order: [ [0], [1], [2], ..., [n]]
     *             |<----------|        |
     *             recursive steps      base step
     *             from right to left
     *
     */
    //index of base step
    let last_index = order.length-1;
    //index of the starting recursive step
    let start_index = order.length-2;

    /*
     * Base step.
     */

      /*
       * Set operator for base step.
       */
    //set operator according to order type.
    let operator = order[last_index][1] === 'ASC' ? '$lte' : '$gte';
    //set strictly '>' or '<' for idAttribute (condition (1)).
    if (!includeCursor && order[last_index][0] === idAttribute) { operator = operator.substring(0, 3); }

      /*
       * Produce condition for base step.
       */
    let where_statement = {
      [order[last_index][0]]: { [operator]: cursor[order[last_index][0]] }
    }

    /*
     * Recursive steps.
     */
    for( let i= start_index; i>=0; i-- ){

      /**
       * Set operators
       */
      //set relaxed operator '>=' or '<=' for condition (2.a or 2.b)
      operator = order[i][1] === 'ASC' ? '$lte' : '$gte';
      //set strict operator '>' or '<' for condition (2.a).
      let strict_operator = order[i][1] === 'ASC' ? '$lt' : '$gt';
      //set strictly '>' or '<' for idAttribute (condition (1)).
      if(!includeCursor && order[i][0] === idAttribute){ operator = operator.substring(0, 3);}

      /**
       * Produce: AND/OR conditions
       */
      where_statement = {
        ['$and'] :[
          /**
           * Set
           * condition (1) in the case of idAttribute or
           * condition (2.a or 2.b) for other fields.
           */
          { [order[i][0] ] : { [ operator ]: cursor[ order[i][0] ] } },

          { ['$or'] :[
            /**
             * Set
             * condition (1) in the case of idAttribute or
             * condition (2.a) for other fields.
             */
            { [order[i][0]]: { [strict_operator]: cursor[ order[i][0] ]} },

            /**
             * Add the previous produced conditions.
             * This will include the base step condition as the most right condition.
             */
            where_statement  ]
          }
        ]
      }
    }
    return where_statement;
  }

  /**
   * parseOrderCursorGeneric - Parse the order options and return the where statement for cursor based pagination (forward)
   *
   * Returns a set of {AND / OR} conditions that cause a ‘WHERE’ clause to deliver only the records ‘greater that’ a given cursor.
   *
   * The meaning of a record being ‘greater than’ a given cursor is that any of the following conditions are fullfilled for the given cursor,
   * order set and idAttribute:
   *
   *    (1) At least the idAttribute of the record is greater than the idAttribute of the cursor if the idAttribute’s order is ASC,
   *    or smaller than if it is DESC.
   *
   *    This condition is sufficient to the record being ‘greater than’ a given cursor, but not strictly necessary.
   *    That is, if some field, different of the idAttribute, appears before the idAttribute on the order array,
   *    and this field fulfills condition 2.a, then the record is considered being ‘greater than’ the given cursor.
   *
   *    (2) If other fields different from idAttribute are given on the order set, as entries of the form [value, ORDER], then, starting from
   *    the first entry, we test the following condition on it:
   *
   *        a) If record.value  is [ > on ASC, or  < on DESC] than cursor.value, then this record is greater than the given cursor.
   *        b) If record.value  is equal to  cursor.value,  then:
   *            i) test the next value on cursor set to determine if it fullfils condition 1) or some of the subconditions 2).[a, b, c],
   *               in order tho determine if the record is 'greater than', or not, the given cursor.
   *        c) else: this record is not greater than the given cursor.
   *
   *
   *
   * @param  {Object} search  Search object whit particular filters.
   * @param  {Array} order  Order entries. Must contains at least the entry for 'idAttribute'.
   * @param  {Object} cursor Cursor record taken as start point(exclusive) to create the where statement.
   * @param  {String} idAttribute  idAttribute of the calling model.
   * @param  {Boolean} includeCursor Boolean flag that indicates if a strict or relaxed operator must be used for produce idAttribute conditions.
   * @return {Object}        Where statement to start retrieving records after the given cursor holding the order conditions.
   */
  module.exports.parseOrderCursorGeneric = function(search, order, cursor, idAttribute, includeCursor){
    /**
     * Checks
     */
    //idAttribute:
    if(idAttribute===undefined||idAttribute===null||idAttribute===''){
      return {};
    }
    //order: must have idAttribute
    if(!order||!order.length||order.length===0||
      !order.map( orderItem=>{return orderItem[0] }).includes(idAttribute)) {
        return {};
    }
    //cursor: must have idAttribute
    if(cursor===undefined||cursor===null||typeof cursor!=='object'||cursor[idAttribute] === undefined){
      return {};
    }

    /**
     * Construct AND/OR conditions using a left-recursive grammar (A => Aa).
     *
     * The base step of the recursion will produce the conditions for the last entry (most right) on the order-array.
     * And each recursive step will produce the conditions for the other entries, starting from the last to the first (from right to left).
     *
     *    order: [ [0], [1], [2], ..., [n]]
     *             |<----------|        |
     *             recursive steps      base step
     *             from right to left
     *
     */
    //index of base step
    let last_index = order.length-1;
    //index of the starting recursive step
    let start_index = order.length-2;

    /*
     * Base step.
     */

      /*
       * Set operator for base step.
       */
    //set operator according to order type.
    let operator = order[last_index][1] === 'ASC' ? 'gte' : 'lte';
    //set strictly '>' or '<' for idAttribute (condition (1)).
    if (!includeCursor && order[last_index][0] === idAttribute) { operator = operator.substring(0, 2); }

      /*
       * Produce condition for base step.
       *
       * Equivalent to non-generic segment:
       *    let where_statement = {
       *      [order[last_index][0]]: { [operator]: cursor[order[last_index][0]] }
       *    }
       */
      let search_field = helper.addSearchField({
        "field": order[last_index][0],
        "value": {"value": cursor[order[last_index][0]]},
        "operator": operator,

        /**
         * Add particular search argument provided as input parámeter.
         * The filters on this serch argument will be the last to apply. 
         * 
         * On non-generic version, this step is done outside this function.
         */
        "search" : search,
      }, 'and');

    /*
     * Recursive steps.
     */
    for( let i= start_index; i>=0; i-- ){

      /**
       * Set operators
       */
      //set relaxed operator '>=' or '<=' for condition (2.a or 2.b)
      operator = order[i][1] === 'ASC' ? 'gte' : 'lte';
      //set strict operator '>' or '<' for condition (2.a).
      let strict_operator = order[i][1] === 'ASC' ? 'gt' : 'lt';
      //set strictly '>' or '<' for idAttribute (condition (1)).
      if(!includeCursor && order[i][0] === idAttribute){ operator = operator.substring(0, 2);}

      /**
       * Produce: AND/OR conditions
       */
      search_field = helper.addSearchField(
        {
          /**
           * Set
           * condition (1) in the case of idAttribute or
           * condition (2.a or 2.b) for other fields.
           * 
           * Equivalent to non-generic segment:
           *    { [order[i][0] ] : { [ operator ]: cursor[ order[i][0] ] } }
           */
          "field": order[i][0],
          "value": {"value": cursor[order[i][0]]},
          "operator": operator,
          
          //and:

          "search": helper.addSearchField({

            /**
             * Set
             * condition (1) in the case of idAttribute or
             * condition (2.a) for other fields.
             * 
             * Equivalent to non-generic segment:
             *    { [order[i][0]]: { [strict_operator]: cursor[ order[i][0] ]} },
             */
            "field": order[i][0],
            "value": {"value": cursor[order[i][0]]},
            "operator": strict_operator,

            //or:

            /**
             * Add the previous produced conditions.
             * This will include the base step condition as the most right condition.
             * 
             * Equivalent to non-generic segment:
             *    where_statement  ]
             */
            "search": search_field,

            /**
             * Set inner recursive search operator.
             * 
             * Equivalent to non-generic segment:
             *    { ['$or'] :[
             */
          }, 'or'),

          /**
           * Set outer recursive search operator.
           * 
           * Equivalent to non-generic segment:
           *    ['$and'] :[
           */
        }, 'and'
      );
    }

    return search_field;
  }

  /**
   * parseOrderCursorBeforeGeneric - Parse the order options and return the where statement for cursor based pagination (backward)
   *
   * Returns a set of {AND / OR} conditions that cause a ‘WHERE’ clause to deliver only the records ‘lesser that’ a given cursor.
   *
   * The meaning of a record being ‘lesser than’ a given cursor is that any of the following conditions are fullfilled for the given cursor,
   * order set and idAttribute:
   *
   *    (1) At least the idAttribute of the record is greater than the idAttribute of the cursor if the idAttribute’s order is DESC,
   *    or smaller than if it is ASC.
   *
   *    This condition is sufficient to the record being 'lesser than’ a given cursor, but not strictly necessary.
   *    That is, if some field, different of the idAttribute, appears before the idAttribute on the order array,
   *    and this field fulfills condition 2.a, then the record is considered being 'lesser than’ the given cursor.
   *
   *    (2) If other fields different from idAttribute are given on the order set, as entries of the form [value, ORDER], then, starting from
   *    the first entry, we test the following condition on it:
   *
   *        a) If record.value  is   [ > on DESC, or  < on ASC] than cursor.value, then this record is lesser than the given cursor.
   *        b) If record.value  is equal to  cursor.value,  then:
   *            i) test the next value on cursor set to determine if it fullfils condition 1) or some of the subconditions 2).[a, b, c],
   *               in order tho determine if the record is 'lesser than', or not, the given cursor.
   *        c) else: this record is not lesser than the given cursor.
   *
   *
   *
   * @param  {Object} search  Search object whit particular filters.
   * @param  {Array} order  Order entries. Must contains at least the entry for 'idAttribute'.
   * @param  {Object} cursor Cursor record taken as start point(exclusive) to create the where statement.
   * @param  {String} idAttribute  idAttribute of the calling model.
   * @param  {Boolean} includeCursor Boolean flag that indicates if a strict or relaxed operator must be used for produce idAttribute conditions.
   * @return {Object}        Where statement to start retrieving records after the given cursor holding the order conditions.
   */
  module.exports.parseOrderCursorBeforeGeneric = function(search, order, cursor, idAttribute, includeCursor){
    /**
     * Checks
     */
    //idAttribute:
    if(idAttribute===undefined||idAttribute===null||idAttribute===''){
      return {};
    }
    //order: must have idAttribute
    if(!order||!order.length||order.length===0||
      !order.map( orderItem=>{return orderItem[0] }).includes(idAttribute)) {
        return {};
    }
    //cursor: must have idAttribute
    if(cursor===undefined||cursor===null||typeof cursor!=='object'||cursor[idAttribute] === undefined){
      return {};
    }

    /**
     * Construct AND/OR conditions using a left-recursive grammar (A => Aa).
     *
     * The base step of the recursion will produce the conditions for the last entry (most right) on the order-array.
     * And each recursive step will produce the conditions for the other entries, starting from the last to the first (from right to left).
     *
     *    order: [ [0], [1], [2], ..., [n]]
     *             |<----------|        |
     *             recursive steps      base step
     *             from right to left
     *
     */
    //index of base step
    let last_index = order.length-1;
    //index of the starting recursive step
    let start_index = order.length-2;

    /*
     * Base step.
     */

      /*
       * Set operator for base step.
       */
    //set operator according to order type.
    let operator = order[last_index][1] === 'ASC' ? 'lte' : 'gte';
    //set strictly '>' or '<' for idAttribute (condition (1)).
    if (!includeCursor && order[last_index][0] === idAttribute) { operator = operator.substring(0, 2); }

      /*
       * Produce condition for base step.
       *
       * Equivalent to non-generic segment:
       *    let where_statement = {
       *      [order[last_index][0]]: { [operator]: cursor[order[last_index][0]] }
       *    }
       */
      let search_field = helper.addSearchField({
        "field": order[last_index][0],
        "value": {"value": cursor[order[last_index][0]]},
        "operator": operator,

        /**
         * Add particular search argument provided as input parámeter.
         * The filters on this serch argument will be the last to apply. 
         * 
         * On non-generic version, this step is done outside this function.
         */
        "search" : search,
      }, 'and');

    /*
     * Recursive steps.
     */
    for( let i= start_index; i>=0; i-- ){

      /**
       * Set operators
       */
      //set relaxed operator '>=' or '<=' for condition (2.a or 2.b)
      operator = order[i][1] === 'ASC' ? 'lte' : 'gte';
      //set strict operator '>' or '<' for condition (2.a).
      let strict_operator = order[i][1] === 'ASC' ? 'lt' : 'gt';
      //set strictly '>' or '<' for idAttribute (condition (1)).
      if(!includeCursor && order[i][0] === idAttribute){ operator = operator.substring(0, 2);}

      /**
       * Produce: AND/OR conditions
       */
      search_field = helper.addSearchField(
        {
          /**
           * Set
           * condition (1) in the case of idAttribute or
           * condition (2.a or 2.b) for other fields.
           * 
           * Equivalent to non-generic segment:
           *    { [order[i][0] ] : { [ operator ]: cursor[ order[i][0] ] } }
           */
          "field": order[i][0],
          "value": {"value": cursor[order[i][0]]},
          "operator": operator,
          
          //and:

          "search": helper.addSearchField({

            /**
             * Set
             * condition (1) in the case of idAttribute or
             * condition (2.a) for other fields.
             * 
             * Equivalent to non-generic segment:
             *    { [order[i][0]]: { [strict_operator]: cursor[ order[i][0] ]} },
             */
            "field": order[i][0],
            "value": {"value": cursor[order[i][0]]},
            "operator": strict_operator,

            //or:

            /**
             * Add the previous produced conditions.
             * This will include the base step condition as the most right condition.
             * 
             * Equivalent to non-generic segment:
             *    where_statement  ]
             */
            "search": search_field,

            /**
             * Set inner recursive search operator.
             * 
             * Equivalent to non-generic segment:
             *    { ['$or'] :[
             */
          }, 'or'),

          /**
           * Set outer recursive search operator.
           * 
           * Equivalent to non-generic segment:
           *    ['$and'] :[
           */
        }, 'and'
      );
    }

    return search_field;
  }

    /**
   * checkExistence - Get the IDs (out of a given list) that are not in use in a given model
   * 
   * @param{Array | object} ids_to_check The IDs that are to be checked, as an array or as a single value
   * @param{object} model The model for which the IDs shall be checked
   * @returns{Promise<boolean>} Are all IDs in use?
   */
  module.exports.checkExistence = async function(ids_to_check, model){
    //check
    if (!module.exports.isNotUndefinedAndNotNull(ids_to_check)) { 
      throw new Error(`Invalid arguments on checkExistence(), 'ids' argument should not be 'null' or 'undefined'`);
    }
    //check existence by count
    let ids = Array.isArray(ids_to_check) ? ids_to_check : [ ids_to_check ];
    let searchArg = {"field":model.idAttribute(),"value":{"type":"Array","value":ids.toString()},"operator":"in"};
    try {
      if (module.exports.isNotUndefinedAndNotNull(model.registeredAdapters)) {
        let allResponsibleAdapters = ids.map(id => model.registeredAdapters[model.adapterForIri(id)]);
        let allResponsibleAdaptersAsArray = Array.isArray(allResponsibleAdapters) ? allResponsibleAdapters : [allResponsibleAdapters];
        let countIds = await model.countRecords(searchArg, module.exports.unique(allResponsibleAdaptersAsArray));
        return countIds === ids.length;
      }
      let countIds = await model.countRecords(searchArg);
      return countIds === ids.length;
    } catch (err) {
      return await ids.reduce(async (prev, curr) => {
        let acc = await prev;
        return acc && await model.readById(curr) !== undefined
      }, Promise.resolve(true))
    }
  }

  /**
   * validateExistence - Make sure that all given IDs correspond to existing records in a given model
   * 
   * @param{Array | object} idsToExist The IDs that are supposed to exist, as an array or as a single value
   * @param{object} model The model for which the IDs should exist
   * @throws If there is an ID given without a corresponding record in the model, in which case the first ID not to exist is given in the error message
   */
  module.exports.validateExistence = async function(idsToExist, model){
    let idsNotInUse = await module.exports.checkExistence(idsToExist, model);
    if (!idsNotInUse) {
      throw new Error(`A given ID has no existing record in data model ${model.definition.model}`);
    }
  }

   /**
   * orderedRecords - javaScript function for ordering of records based on GraphQL orderInput for local post-processing
   *
   * @param  {Array} matchingRecords  List of records to be ordered
   * @param  {Object} order GraphQL order options to be used
   * @return {Array}        order List of records
   */
  module.exports.orderRecords = function(matchingRecords, order = [{field, order}]) {
    return _.orderBy(matchingRecords,_.map(order,'field'),_.map(order,'order').map(orderArg => orderArg.toLowerCase()));
    //This could be sped up by to O(n*m), m = # of remote servers by using merge sort
  }


  /**
  * paginateRecordsCursor - post-precossing pagination of ordered records (forward)
  *
  * @param  {Array} orderedRecords  List of records to be paginated
  * @param  {Object} paginate GraphQL paginate argument
  * @return {Array}        paginated List of records
  */
   module.exports.paginateRecordsCursor = function(orderedRecords, first) {
     return orderedRecords.slice(0,first);
   }

 /**
  * paginateRecordsBefore - post-precossing pagination of ordered records (backwards)
  *
  * @param  {Array} orderedRecords  List of records to be paginated
  * @param  {Object} paginate GraphQL paginate argument
  * @return {Array}        paginated List of records
  */
   module.exports.paginateRecordsBefore = function(orderedRecords, last) {
     return orderedRecords.slice(Math.max(orderedRecords.length - last,0));
   }

  /**
   * toGraphQLConnectionObject - translate an array of records into a GraphQL connection
   *
   * @param  {Array} paginatedRecords List of records to be translated
   * @param  {Object} model            Record's type
   * @param  {Boolean} hasNextPage      hasNextPage parameter for pagination info
   * @return {type}                  description
   */
  module.exports.toGraphQLConnectionObject = function(paginatedRecords, model, hasNextPage, hasPreviousPage) {
    let edges = paginatedRecords.map(e => {
        let temp_node = new model(e);
        return {
            node: temp_node,
            cursor: temp_node.base64Enconde()
        }
    })

    let pageInfo = {
      hasNextPage: hasNextPage,
      hasPreviousPage: hasPreviousPage,
      endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
      startCursor: edges.length > 0 ? edges[0].cursor : null
    }

    return {
        edges,
        pageInfo
    };
  }

  /**
   * asyncForEach - Asynchronous for each
   *
   * @param  {Array} array    Array to transver
   * @param  {function} callback Callback to execute with each element in the array
   */
  module.exports.asyncForEach = async function(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }

  /**
   * Checks authorization for the adapters of the current logged in user
   * (context) for the action (permission).
   *
   * @param {object} context - The GraphQL context passed to the resolver
   * @param {array} adapters - Array of adapters (see Cenzontle distributed data
   * models)
   * @param {string} permission - The action the user wants to perform on the
   * resources (adapters).
   *
   * @return {Promise<object>} The return value of this function has two properties:
   * 'authorizedAdapters' is an array of those adapters that passed the
   * authorization check, and 'authorizationErrors' is an array of Error objects
   * created for those adapters the user (context) has no authorization for given
   * the requested permission (action).
   */
  module.exports.authorizedAdapters = async function (context, adapters, permission) {
    let result = {
      authorizedAdapters: [],
      authorizationErrors: []
    };

    for (let i = 0; i < adapters.length; i++) {
      let currAdapter = adapters[i];

      if (await checkAuthorization(context, currAdapter.adapterName, permission) === true) {
        result.authorizedAdapters.push(currAdapter)
      } else {
        result.authorizationErrors.push(new Error(
          `You don't have authorization to perform ${permission} on ${currAdapter.adapterName}`
        ))
      }
    }
    return result;
  }

  /**
   * Returns a new array instance with the set of adapters that remains after 
   * remove all excluded adapters, specified on the search.excludeAdapterNames
   * input, from the @adapters array. 
   * 
   * This function does not modify the @adapter param, but instead, returns a new
   * array instance.
   *
   * @param {object} search - The GraphQL context passed to the resolver
   * @param {array} adapters - Array of registered adapters (see Cenzontle distributed data
   * models)
   *
   * @return {array} Array of resulting adapters, after removing those specified
   * on the search.excludeAdapterNames input. If search.excludeAdapterNames is not
   * defined or is empty, the array returned will be equal to the @adapters array.
   */
  module.exports.removeExcludedAdapters = function(search, adapters) {
    let result = Array.from(adapters);
    
    //check: @adapters
    if(adapters.length === 0) {
      return [];
    }//else
    
    //check: @search
    if((!search || typeof search !== 'object') //has not search object
      || (!search.excludeAdapterNames //or has search object but has not exclusions
          || !Array.isArray(search.excludeAdapterNames) 
          || search.excludeAdapterNames.length === 0)) {
      return result;
    }//else
    
    //do: exclusion
    let i = 0;
    while (i < result.length) {
      if(search.excludeAdapterNames.includes(result[i].adapterName)) {
        //remove adapter
        result.splice(i,1);
      } else {
        //next
        i++;
      }
    }
    return result
  }

  /**
   * addExclusions - Adds all @registeredAdapters, except the @currentAdapter, to
   * the @excludeAdapterNames on search object.
   *
   * @param {object} search - Search object.
   * @param {string} currentAdapterName - String of the current adapterName. 
   * @param {array} registeredAdapters - Array of registered adapters for the calling ddm.
   *
   * @return {object} New search object that includes the excluded adapters on the 
   * attribute @excludeAdapterNames. This functions does not modify the @search object,
   * instead a new one is returned. 
   */
  module.exports.addExclusions = function(search, currentAdapterName, registeredAdapters) {
    let nsearch = {};

    //check
    if((!search || typeof search !== 'object')) { //has not search object

      nsearch.excludeAdapterNames = [];

    } else {
      //check
      if(search.excludeAdapterNames === undefined) { //search object has not exclusions

        nsearch = {
          ...search
        };
        nsearch.excludeAdapterNames = [];

      } else {//exclusions are defined

        //check
        if(!Array.isArray(search.excludeAdapterNames)){ //defined but invalid
          throw new Error('Illegal excludeAdapterNames parameter in search object, it should be an array.');
        }//else

        nsearch = {
          ...search
        };
      }
    }

    /*
     * append all @registeredAdapters, except the @currentAdapter, 
     * to search.excludeAdapterNames array.
     */
    registeredAdapters.forEach(a => {
      if(a.adapterName !== currentAdapterName && !nsearch.excludeAdapterNames.includes(a.adapterName)) {
        //add adapter name to exclude list
        nsearch.excludeAdapterNames.push(a.adapterName);
      }
    });

    return nsearch;
  }

  /**
   * writeBenignErrors - writes the benignErrors to the context and removes them
   * from the resultObject
   *
   * @param {object} authorizationCheck - return value of authorizedAdapters Helper.
   * @param {object} context - The GraphQL context passed to the resolver.
   * @param {array} resultObj - Connection- or CountObj returned by ddm readMany.
   *
   * @return {array} Returns the changed resultObj and context with the added benignErrors 
   */
  module.exports.writeBenignErrors = function(authorizationCheck, context, resultObj) {
    //check adapter authorization Errors
    if (authorizationCheck.authorizationErrors.length > 0) {
      context.benignErrors = context.benignErrors.concat(authorizationCheck.authorizationErrors);
    }
    //check Errors returned by the model layer (time-outs, unreachable, etc...)
    if (resultObj.errors !== undefined && Array.isArray(resultObj.errors) && resultObj.errors.length > 0) {
        context.benignErrors = context.benignErrors.concat(resultObj.errors)
        delete resultObj['errors']
    }
    console.log("resultObj: " + JSON.stringify(resultObj))
    console.log("context_benignErrors: " + JSON.stringify(context.benignErrors))
    return [resultObj,context];
  }

  /**
   * addSearchField - Creates a new search object which one will include the new search 
   * instance (@field, @value, @operator) with values passed as arguments.
   * 
   * This function preserves the attribute @excludeAdapterNames if exists on the @search argument.
   * 
   * This function does not modifies the @search object received, instead creates a new one.
   *
   * @param  {string} field Field to filter. Must be defined.
   * @param  {object} value Value contains type(i.e. array, string) and actual value to match in the filter. Must be defined.
   * @param  {string} operator Operator used to perform the filter. Must be defined.
   * @param  {object} search Recursive search object.
   * @param  {string} recursiveOperator Recursive operator that will be set beetwen recursive search objects.
   *
   * @return {object} New search object.
   *
   */
  module.exports.addSearchField = function ({search, field, value, operator}, recursiveOperator) {
    let nsearch = {};
    let recursiveOp = recursiveOperator ? recursiveOperator : 'and'; 

    //check
    if(operator === undefined || field === undefined || value === undefined) {
      throw new Error('Illegal arguments, neither of: (@field, @value, @operator) can be undefined.');
    }

    /**
     * Case 1: @search is undefined.
     * 
     * Create a new search object with received parameters.
     */
    if(search === undefined) {
      nsearch = {
        "field": field,
        "value": value,
        "operator": operator
      };
    } else {
      
      //check
      if(typeof search !== 'object') {
        throw new Error('Illegal "@search" argument type, it must be an object.');
      }
      
      /**
       * Case 2: @search is defined but has not search-operation attributes defined.
       * 
       * Create a new search object with received parameters and preserve @excludeAdapterNames
       * attribute.
       */
      if(search.operator === undefined || (search.value === undefined && search.search === undefined)) {
        
        search = {
          "field": field,
          "value": value,
          "operator": operator,
          "excludeAdapterNames": search.excludeAdapterNames
        };
      } else {
        /**
         * Case 3: @search is defined and has search-operation attributes defined.
         * 
         * Create a new recursive search object with received parameters and preserve @excludeAdapterNames
         * attribute.
         */
        let csearch = {...search};
        let excludeAdapterNames = csearch.excludeAdapterNames;
        delete csearch.excludeAdapterNames;
        
        nsearch = {
          "operator": recursiveOp,
          "search": [{
            "field": field,
            "value": value,
            "operator": operator
          }, csearch],
          "excludeAdapterNames": excludeAdapterNames
        };
      }
    }  
    return nsearch;
  }

  /**
   * isNonEmtpyArray - Test a value for being a non-empty array
   * 
   * @param {any} a value to be tested for being a non-empty array
   * @returns {boolean} result
   */
  module.exports.isNonEmptyArray = function (a) {
    return (Array.isArray(a) && a.length > 0);
  }

  /**
   * isNotUndefinedAndNotNull - Test a value for being neither undefined nor null
   * @param {any} v value to be tested for being neither undefined nor null
   * @returns {boolean} result
   */
  module.exports.isNotUndefinedAndNotNull = function (v) {
    return (v !== undefined && v !== null);
  }

  module.exports.isEmptyArray = function(a) {
    return (a !== undefined && Array.isArray(a) && a.length === 0);
  }

  /**
   * unique - Take an array and remove all elements that are already there
   * @param {array} inputArray array to be pruned
   * @returns {array} array with no element being present more than once
   */
  module.exports.unique = function (inputArray) {
    return [...new Set(inputArray)];
  }

  /**
   * sanitizeAssociationArguments - Make sure that no id is given more than once, and remove additional appearances of those ids
   * @param {object} input the object with the input values
   * @param {array} argNamesArray The array with the names of the input keys
   * @returns {object} The pruned input object
   */
  module.exports.sanitizeAssociationArguments = function(input, argNamesArray) {
    let sanitizedInput = Object.assign({}, input);
    for (let argument of argNamesArray) {
      let element = input[`${argument}`];
      if (module.exports.isNonEmptyArray(element)) {
        sanitizedInput[`${argument}`] = module.exports.unique(input[`${argument}`]);
      } else if (module.exports.isNotUndefinedAndNotNull(element)) {
        sanitizedInput[`${argument}`] = element;
      }
    }
    return sanitizedInput;
  }

  /**
   * countRecordsInAssociationArgs - Count the number of records that are affected by the input, including records of associations
   * @param {object} input The input object
   * @param {array} argNamesArray The array with the names of the input keys
   * @returns {number} The number of the records
   */
  module.exports.countRecordsInAssociationArgs = function(input, argNamesArray) {
    return argNamesArray.reduce( function(acc, curr) {
      let element = input[`${curr}`];
      if (module.exports.isNonEmptyArray(element)) {
        return (acc + element.length);
      } else if (module.exports.isNotUndefinedAndNotNull(element)) {
        return (acc + 1);
      } else {
        return acc;
      }
    }, 0);
  }

  /**
   * checkAuthorizationOnAssocArgs - Check the authorization for all involved models / adapters
   * @param {object} input The input object
   * @param {object} context The context object
   * @param {object} associationArgsDef The definition of the association arguments
   * @param {array} permissions The permissions to be checked
   * @param {object} modelsIndex The index of the models
   * @returns {Promise<boolean>} Is the procedure allowed?
   * @throws If this is not allowed, throw the first error
   */
  module.exports.checkAuthorizationOnAssocArgs = async function( input, context, associationArgsDef, permissions = ['read', 'update'], modelsIndex = models_index ) {
    return await Object.keys(associationArgsDef).reduce(async function(prev, curr) {
      let acc = await prev;
      let hasInputForAssoc = module.exports.isNonEmptyArray(input[curr]) || ( !Array.isArray(input[curr]) && input[curr] !== '' && module.exports.isNotUndefinedAndNotNull(input[curr]));
      if (hasInputForAssoc) {
        let targetModelName = associationArgsDef[curr]
        let targetModel = modelsIndex[`${targetModelName}`];
        let storageType = targetModel.definition.storageType;

        // Look into the definition of the associated data model and ask for its storage type.
        // TWO CASES: 
        // 1) target model storage type: NON distributed (any other)
        if (storageType !== 'distributed-data-model') {
          return await permissions.reduce(async (prev, curr) => {
            let acc = await prev;
            return acc && await checkAuthorization(context, targetModelName, curr )},
            Promise.resolve(true)
          )
        }
        // 2) target model storage type: distributed model (DDM)
        // Get mathematical set of responsible adapters for Ids in input
        // check 'permissions' on these adapters
        // Difference to above is getting Adapters for provided association IRIs (IDs)
        // and check the argument permissions on each of those
        let currAssocIds = input[curr];
        if (! module.exports.isNonEmptyArray( currAssocIds ) ) { currAssocIds = [ currAssocIds ] }
        let currAdapters = module.exports.unique(currAssocIds.map(id => targetModel.registeredAdapters[targetModel.adapterForIri(id)]));
        return await permissions.reduce(async (prev, curr) =>  {
          let acc = await prev;
          let newErrors = await module.exports.authorizedAdapters(context, currAdapters, curr).authorizationErrors;
          if (module.exports.isNonEmptyArray(newErrors)) {
            throw new Error(newErrors[0]);
          }
          return acc && newErrors !== []; 
        }, Promise.resolve(true))
      } else {
       return acc
      
      }
    }, Promise.resolve(true));
  }

   /** validateAssociationArgsExistence - Receives arrays of ids on @input, and checks if these ids exists. Returns true
   * if all received ids exist, and throws an error if at least one of the ids does not exist.
   * 
   * @param  {object} input   Object with sanitized entries of the form: <add>Association:[id1, ..., idn].
   * @param  {object} context Object with mutation context attributes.
   * @param  {object} associationArgsDef  The definition of the association arguments
   * @param {object} modelsIndex The index of the models
   * @throws if the association arguments don't exist
   * @returns {boolean} true, if the associations arguments exist
   */
  module.exports.validateAssociationArgsExistence = async function(input, context, associationArgsDef, modelsIndex = models_index) {
    await Object.keys(associationArgsDef).reduce(async function(prev, curr){
      let acc = await prev;
      
      //get ids (Int or Array)
      let currAssocIds = input[curr];

      //check: if empty array or undefined or null --> return true
      if(module.exports.isEmptyArray(currAssocIds) || !module.exports.isNotUndefinedAndNotNull(currAssocIds)) {
        return acc; //equivalent to: acc && true
      } //else...

      //if not array make it one
      if(!module.exports.isNonEmptyArray(currAssocIds)) {
        currAssocIds = [currAssocIds];
      }

      //do check
      let currModelName = associationArgsDef[curr];
      let currModel = modelsIndex[`${currModelName}`];

      await module.exports.validateExistence( currAssocIds, currModel );

      return acc
    }, Promise.resolve(true));

    return true;

  }

  /** checkAndAdjustRecordLimitForCreateUpdate - If the number of records affected by the input
   * exceeds the current value of recordLimit throws an error, otherwise adjusts context.recordLimit
   * and returns totalCount.
   * 
   * @param  {object} input   Input Object.
   * @param  {object} context Object with context attributes.
   * @param  {object} associationArgsDef  Object with entries of the form {'<add>Association' : model}
   * @return {int} If the number of records affected by the input exceeds the current value of 
   * recordLimit throws an error, otherwise adjusts context.recordLimit and returns totalCount.
   */
  module.exports.checkAndAdjustRecordLimitForCreateUpdate = function(input, context, associationArgsDef) {
    // get total count
    let totalCount = this.countRecordsInAssociationArgs(input, Object.keys(associationArgsDef));
    // add one to total count, to reflect the "root" record being created or updated:
    totalCount++;
    if (totalCount > context.recordLimit) { throw new Error('Record limit has been exceeded.') }
    // adjust record limit
    context.recordLimit -= totalCount;
    return totalCount;
  }

  module.exports.countRecordsInAssociationArgs = function(input, argNamesArray) {
    return argNamesArray.reduce( function(acc, curr) {
      let element = input[`${curr}`];
      if (module.exports.isNonEmptyArray(element)) {
        return (acc + element.length);
      } else if (module.exports.isNotUndefinedAndNotNull(element)) {
        return (acc + 1);
      } else {
        return acc;
      }
    }, 0);
  }
