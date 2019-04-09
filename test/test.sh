#!/usr/bin/env bash

# Start a local Cassandra server with Docker
docker run --name sdb_cassandra -d --rm -p 7000:7000 -p 7001:7001 -p 7199:7199 -p 9042:9042 cassandra:3.11.4

# Run the tests
mocha test/test.js --exit

# Stop Cassandra server and clean up
docker stop sdb_cassandra
