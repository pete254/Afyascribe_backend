// src/users/users.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { FacilityUsersController } from './facility-users.controller';
import { User } from './entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { FacilitiesModule } from '../facilities/facilities.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => AuthModule),
    FacilitiesModule, // Provides InviteCodesService for FacilityUsersController
  ],
  controllers: [UsersController, FacilityUsersController],
  providers: [UsersService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}