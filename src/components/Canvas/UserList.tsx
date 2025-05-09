// src/components/Canvas/UserList.tsx
'use client';

interface User {
  id: string;
  name: string;
  position: { x: number; y: number };
}

interface UserListProps {
  users: User[];
}

export const UserList: React.FC<UserListProps> = ({ users }) => {
  if (users.length === 0) return null;
  
  return (
    <div className="fixed top-48 right-4 bg-white p-4 rounded-lg shadow-lg max-w-xs">
      <h3 className="font-bold mb-2">Connected Users</h3>
      <ul className="max-h-60 overflow-y-auto">
        {users.map(user => (
          <li key={user.id} className="flex items-center gap-2 py-1">
            <div className="w-3 h-3 bg-green-500 rounded-full" />
            {user.name}
          </li>
        ))}
      </ul>
    </div>
  );
};