jest.mock('./friendship.service', () => ({
  FriendshipService: class FriendshipService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { FriendshipController } from './friendship.controller';
import { FriendshipService } from './friendship.service';

describe('FriendshipController', () => {
  let controller: FriendshipController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FriendshipController],
      providers: [{ provide: FriendshipService, useValue: {} }],
    }).compile();

    controller = module.get<FriendshipController>(FriendshipController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
