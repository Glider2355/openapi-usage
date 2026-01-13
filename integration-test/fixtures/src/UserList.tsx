import { createClient } from "openapi-fetch";
import type { paths } from "./schema";

const api = createClient<paths>();

export function UserList() {
  const fetchUsers = async () => {
    const { data } = await api.GET("/users");
    return data;
  };

  return <div>Users</div>;
}
