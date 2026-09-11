import { ObjectType, Field, ID } from '@nestjs/graphql';

/**
 * GraphQL ObjectType for admin entries.
 * Returned by searchAdmins — the resolver always returns the real email.
 * Masking to '****' for the superadmin entry happens ONLY in the frontend component.
 */
@ObjectType('Admin')
export class AdminType {
  @Field(() => ID)
  _id: string;

  @Field()
  name: string;

  @Field()
  email: string;

  @Field()
  role: string;
}
