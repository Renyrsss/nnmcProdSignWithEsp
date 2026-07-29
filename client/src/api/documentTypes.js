import axios from "axios";
import { getToken } from "./auth";
import { getApiRoot } from "../config/organizations";

export const getDocumentTypes = async () => {
    const token = getToken();
    const response = await axios.get(`${getApiRoot()}/document-types?sort=name`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return response.data.data;
};
