import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RelativeController } from './relative.controller';
import { RelativeService } from './relative.service';

// Import Entities
import { Relative } from '../../../entities/relatives.entity';
import { User } from '../../../entities/users.entity';
import { FamilyGroup } from '../../../entities/family-group.entity';
import { FamilyMember } from '../../../entities/family-member.entity';

@Module({
        imports: [TypeOrmModule.forFeature([Relative, User, FamilyGroup, FamilyMember])],
        controllers: [RelativeController],
        providers: [RelativeService],
        exports: [RelativeService],
})
export class RelativeModule {}
