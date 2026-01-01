import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    if (data) {
      const value = user[data];
      // Convert ObjectId to string if _id is requested
      if (data === '_id' && value) {
        return value.toString();
      }
      return value;
    }

    return user;
  },
);
