import { Resolver, Query, Args } from '@nestjs/graphql';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import GraphQLJSON from 'graphql-type-json';
import { AdminType } from './models/admin.model';
import { Admin, AdminDocument } from './schemas/admin.schema';

/**
 * Escapes a string for safe use as a MongoDB $regex pattern.
 * Used for the 'name' argument only — rawFilter is intentionally unsanitized.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Resolver(() => AdminType)
export class AdminResolver {
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
  ) {}

  /**
   * searchAdmins — two arguments, two very different security postures:
   *
   * name:      SAFE   — passed through escapeRegex(), then used in $regex
   * rawFilter: UNSAFE — passed DIRECTLY to adminModel.find() with NO sanitization.
   *                     This is Vulnerability 3 (GraphQL NoSQLi).
   *                     The argument is intentionally not shown in the UI.
   *                     It is discoverable only via GraphQL introspection.
   *
   * Introspection (not disabled) will reveal:
   *   { "name": "rawFilter", "type": { "name": "JSON", "kind": "SCALAR" } }
   *
   * Injection payload that extracts the superadmin:
   *   searchAdmins(rawFilter: { role: { $eq: "superadmin" } }) { name email }
   */
  @Query(() => [AdminType])
  async searchAdmins(
    @Args({ name: 'name', type: () => String, nullable: true }) name?: string,
    @Args({ name: 'rawFilter', type: () => GraphQLJSON, nullable: true })
    rawFilter?: Record<string, any>,
  ): Promise<AdminDocument[]> {
    if (rawFilter !== undefined && rawFilter !== null) {
      // INTENTIONAL NoSQLi — no sanitization, no operator blocklist.
      // rawFilter is passed verbatim to MongoDB.find().
      return this.adminModel.find(rawFilter).exec();
    }

    if (name) {
      const results = await this.adminModel
        .find({ name: { $regex: escapeRegex(name) } })
        .exec();
      // Mask superadmin email — safe-path only.
      // rawFilter path (above) returns the real email, enabling Vulnerability 3.
      return results.map((admin) => {
        if (admin.role === 'superadmin') {
          return Object.assign(admin, { email: '****' });
        }
        return admin;
      });
    }

    const all = await this.adminModel.find().exec();
    return all.map((admin) => {
      if (admin.role === 'superadmin') {
        return Object.assign(admin, { email: '****' });
      }
      return admin;
    });
  }
}
