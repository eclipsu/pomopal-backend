import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { User } from './../entities/user.entity';
import { StorageService } from '../storage/storage.service';
import { UserExistenceBloomService } from './user-existence-bloom.service';

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            createQueryBuilder: jest.fn(() => ({
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn(),
            })),
          },
        },
        { provide: StorageService, useValue: {} },
        { provide: UserExistenceBloomService, useValue: {} },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
