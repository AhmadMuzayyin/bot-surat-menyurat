// users.js
const fs = require('fs').promises;
const path = require('path');

const USERS_FILE = path.join(__dirname, 'users.json');
const ADMIN_ID = '7833811749'; // Ganti dengan ID Telegram admin

async function initializeUsersFile() {
  try {
    await fs.access(USERS_FILE);
  } catch (error) {
    await fs.writeFile(USERS_FILE, JSON.stringify({
      users: [],
      pendingUsers: [],
      rejectedUsers: []
    }, null, 2));
  }
}
async function getUsersData() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading users file:', error);
    return { users: [], pendingUsers: [] };
  }
}
async function saveUsersData(data) {
  await fs.writeFile(USERS_FILE, JSON.stringify(data, null, 2));
}
function isAdmin(userId) {
  return ADMIN_ID.includes(userId.toString());
}
async function isUserRegistered(userId) {
  const data = await getUsersData();
  return data.users.some(user => user.userId === userId);
}
async function isUserPending(userId) {
  const data = await getUsersData();
  return data.pendingUsers.some(user => user.userId === userId);
}
async function addPendingUser(userInfo) {
  try {
    const data = await getUsersData();

    // Check if user is already registered or pending
    if (await isUserRegistered(userInfo.userId) || await isUserPending(userInfo.userId)) {
      return false;
    }

    // Add to pending users
    data.pendingUsers.push({
      userId: userInfo.userId,
      firstName: userInfo.firstName,
      lastName: userInfo.lastName || '',
      username: userInfo.username || '',
      requestedAt: new Date().toISOString()
    });

    await saveUsersData(data);
    return true;
  } catch (error) {
    console.error('Error adding pending user:', error);
    return false;
  }
}
async function approveUser(userId) {
  try {
    const data = await getUsersData();
    const pendingUserIndex = data.pendingUsers.findIndex(user => user.userId === userId);
    if (pendingUserIndex === -1) return false;

    const approvedUser = {
      ...data.pendingUsers[pendingUserIndex],
      approvedAt: new Date().toISOString()
    };

    data.users.push(approvedUser);
    data.pendingUsers.splice(pendingUserIndex, 1);

    await saveUsersData(data);
    return approvedUser;
  } catch (error) {
    console.error('Error approving user:', error);
    return false;
  }
}
async function rejectUser(userId) {
  try {
    const data = await getUsersData();
    if (!data.rejectedUsers) {
      data.rejectedUsers = [];
    }

    const pendingUserIndex = data.pendingUsers.findIndex(user => user.userId === userId);
    if (pendingUserIndex === -1) return false;

    const rejectedUser = {
      ...data.pendingUsers[pendingUserIndex],
      rejectedAt: new Date().toISOString(),
      status: 'rejected'
    };
    data.rejectedUsers.push(rejectedUser);
    data.pendingUsers.splice(pendingUserIndex, 1);
    await saveUsersData(data);
    return rejectedUser;
  } catch (error) {
    console.error('Error rejecting user:', error);
    return false;
  }
}
async function getPendingUsers() {
  const data = await getUsersData();
  return data.pendingUsers;
}
async function getUserById(userId, bot) {
  try {
    // Coba dapatkan info user dari bot
    const chatMember = await bot.getChatMember(userId, userId);

    if (chatMember) {
      const user = chatMember.user;
      return {
        success: true,
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name || '',
          username: user.username || '',
          isBot: user.is_bot,
          languageCode: user.language_code
        }
      };
    }

    return {
      success: false,
      error: 'User tidak ditemukan'
    };

  } catch (error) {
    console.error('Error getting user info:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
async function getRejectedUsers() {
  try {
    const data = await getUsersData();
    return {
      success: true,
      rejectedUsers: data.rejectedUsers || []
    };
  } catch (error) {
    console.error('Error getting rejected users:', error);
    return {
      success: false,
      error: error.message,
      rejectedUsers: []
    };
  }
}
module.exports = {
  initializeUsersFile,
  isUserRegistered,
  isUserPending,
  addPendingUser,
  approveUser,
  rejectUser,
  getPendingUsers,
  isAdmin,
  ADMIN_ID,
  getUserById,
  getRejectedUsers,
  saveUsersData,
  getUsersData
};