import { Scalar, CustomScalar } from '@nestjs/graphql';
import { Kind, ValueNode } from 'graphql';
import GraphQLJSON from 'graphql-type-json';

/**
 * JSON scalar — delegates to graphql-type-json.
 * Registered as 'JSON' in the schema so introspection correctly shows
 * rawFilter as: { "name": "rawFilter", "type": { "name": "JSON", "kind": "SCALAR" } }
 */
@Scalar('JSON')
export class JsonScalar implements CustomScalar<any, any> {
  description = 'Arbitrary JSON scalar type';

  parseValue(value: unknown): any {
    return GraphQLJSON.parseValue(value);
  }

  serialize(value: unknown): any {
    return GraphQLJSON.serialize(value);
  }

  parseLiteral(ast: ValueNode): any {
    return GraphQLJSON.parseLiteral(ast, {});
  }
}
