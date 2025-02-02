import express, { Request } from "express";
import cors from "cors";
import mongoose from "mongoose";
import { ApolloServer, gql } from "apollo-server-express";
import { makeExecutableSchema, mergeSchemas } from "graphql-tools";
import { buildApolloSchema } from "@vulcanjs/graphql/server";

import mongoConnection from "~/lib/api/middlewares/mongoConnection";
import corsOptions from "~/lib/api/cors";
import { contextFromReq } from "~/lib/api/context";
import models from "~/models/index.server";

// will trigger seed
import runSeed from "~/lib/api/runSeed";

/**
 * Example graphQL schema and resolvers generated using Vulcan declarative approach
 * http://vulcanjs.org/
 */
const vulcanRawSchema = buildApolloSchema(models);
const vulcanSchema = makeExecutableSchema(vulcanRawSchema);

/**
 * Example custom Apollo server, written by hand
 */
const typeDefs = gql`
  type Query {
    restaurants: [Restaurant]
  }
  type Restaurant {
    _id: ID!
    name: String
  }
`;
const resolvers = {
  Query: {
    // Demo with mongoose
    // Expected the database to be setup with the demo "restaurant" API from mongoose
    async restaurants() {
      try {
        const db = mongoose.connection;
        const restaurants = db.collection("restaurants");
        // @ts-ignore
        const resultsCursor = (await restaurants.find(null, null)).limit(5);
        const results = await resultsCursor.toArray();
        return results;
      } catch (err) {
        console.log("Could not fetch restaurants", err);
        throw err;
      }
    },
  },
};
const customSchema = makeExecutableSchema({ typeDefs, resolvers });
// NOTE: schema stitching can cause a bad developer experience with errors
const mergedSchema = mergeSchemas({ schemas: [vulcanSchema, customSchema] });

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) throw new Error("MONGO_URI env variable is not defined");

// Define the server (using Express for easier middleware usage)
const server = new ApolloServer({
  schema: mergedSchema,
  context: ({ req }) => contextFromReq(req as Request),
  introspection: process.env.NODE_ENV !== "production",
  playground:
    process.env.NODE_ENV !== "production"
      ? {
          settings: {
            "request.credentials": "include",
          },
        }
      : false,
  formatError: (err) => {
    // This function is mandatory to log error messages, even in development
    // You may enhance this function, eg by plugging an error tracker like Sentry in production
    console.error(err);
    return err;
  },
});

const app = express();

app.set("trust proxy", true);

const gqlPath = "/api/graphql";
// setup cors
app.use(gqlPath, cors(corsOptions));
// init the db
app.use(gqlPath, mongoConnection(mongoUri));

server.applyMiddleware({ app, path: "/api/graphql" });

export default app;

export const config = {
  api: {
    bodyParser: false,
  },
};

// Seed in development
runSeed();
