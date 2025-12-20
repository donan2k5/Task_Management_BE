import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.schema';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  // CREATE
  create(dto: CreateUserDto) {
    return this.userModel.create(dto);
  }

  // READ ALL
  findAll() {
    return this.userModel.find();
  }

  // READ ONE
  findOne(id: string) {
    return this.userModel.findById(id);
  }

  // UPDATE
  update(id: string, dto: CreateUserDto) {
    return this.userModel.findByIdAndUpdate(id, dto, { new: true });
  }

  // DELETE
  remove(id: string) {
    return this.userModel.findByIdAndDelete(id);
  }
}
